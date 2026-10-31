"""Build a self-contained web preview of JigMap Maldives from the real ingested data.

The preview is a static page (MapLibre GL JS) that needs no server: tiles are bundled into
"pack" files fetched by relative path, the GEBCO depth grid is bundled for tap-for-depth,
and contours / candidates are GeoJSON. It shows the same data as the app, but it is not the
app: there is no sign-in, live API, offline download or GPS (browsers block location in
embedded previews).

Usage (from backend/, with db + s3 running and both datasets ingested):
    .venv/bin/python ../tools/web_preview/build_preview.py ../preview_build
"""

import base64
import io
import gzip
import json
import os
import struct
import sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import psycopg
import rasterio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
from app.core import storage  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.ingestion.analysis import TID_LABELS  # noqa: E402

PACK_TARGET = 6_000_000  # bytes per pack file (lazy-loaded by the page)
HERE = os.path.dirname(__file__)


def list_keys(prefix: str) -> list[str]:
    keys = []
    pag = storage._client().get_paginator("list_objects_v2")
    for page in pag.paginate(Bucket=get_settings().s3_bucket, Prefix=prefix + "/"):
        keys += [o["Key"] for o in page.get("Contents", [])]
    return keys


def build_packs(out_dir: str, layer: str, prefix: str, ext: str) -> tuple[dict, list[str]]:
    """Group tiles into pack files; index maps 'z/x/y' -> [pack, offset, length]."""
    keys = sorted(list_keys(prefix), key=lambda k: [int(p) for p in k[len(prefix) + 1 :].removesuffix(ext).split("/")])
    with ThreadPoolExecutor(16) as pool:
        blobs = list(pool.map(storage.get_bytes, keys))
    index, packs = {}, []
    buf, n = bytearray(), 0

    def flush():
        nonlocal buf, n
        if buf:
            name = f"{layer}_{n}.txt"
            with open(os.path.join(out_dir, name), "wb") as fh:
                fh.write(base64.b64encode(bytes(buf)))  # the artifact host serves text, not raw binary
            packs.append(name)
            buf, n = bytearray(), n + 1

    for key, data in zip(keys, blobs, strict=True):
        if len(buf) + len(data) > PACK_TARGET:
            flush()
        zxy = key[len(prefix) + 1 :].removesuffix(ext)
        index[zxy] = [n, len(buf), len(data)]
        buf += data
    flush()
    return index, packs


def main(out_dir: str) -> None:
    data_dir = os.path.join(out_dir, "data")
    os.makedirs(data_dir, exist_ok=True)
    with psycopg.connect("postgresql://jigmap:jigmap@localhost/jigmap") as c:
        s2 = c.execute(
            "select tiles_prefix, attribution, acquired_from, acquired_to, scene_count, bounds from imagery_mosaics "
            "where is_active"
        ).fetchone()
        ds = c.execute(
            "select id, tiles_prefix, grid_key, tid_key, citation, source_last_modified, resolution_m_approx "
            "from bathymetry_metadata where is_active"
        ).fetchone()
        contours = c.execute(
            "select depth_m, ST_AsGeoJSON(geom, 5) from bathymetry_contours where dataset_id=%s", (ds[0],)
        ).fetchall()
        ocean_rows = c.execute(
            "select variable, tiles_prefix, observed_at, product, product_level, data_kind, units from "
            "ocean_observations where is_latest"
        ).fetchall()
        pred_rows = c.execute(
            "select model, tiles_prefix, valid_for, grid_key, params, validation, model_version from "
            "fishing_predictions where is_latest"
        ).fetchall()
        feats = c.execute(
            "select kind, depth_m, relief_m, max_slope_deg, depth_range_m, source_tid, explanation, "
            "ST_X(geom), ST_Y(geom) from bathymetry_features where dataset_id=%s",
            (ds[0],),
        ).fetchall()

    manifest = {"packs": {}, "index": {}}
    for layer, prefix, ext in (
        ("s2", s2[0], ".webp"),
        ("depth", ds[1] + "/depth", ".png"),
        ("slope", ds[1] + "/slope", ".png"),
        *[(v, pre, ".png") for v, pre, *_ in ocean_rows],
        *[(m, pre, ".png") for m, pre, *_ in pred_rows],
    ):
        idx, packs = build_packs(data_dir, layer, prefix, ext)
        manifest["index"][layer] = idx
        manifest["packs"][layer] = packs
        print(layer, len(idx), "tiles in", len(packs), "packs")

    with open(os.path.join(data_dir, "contours.json"), "w") as fh:
        json.dump({"type": "FeatureCollection", "features": [
            {"type": "Feature", "properties": {"depth_m": d}, "geometry": json.loads(g)} for d, g in contours
        ]}, fh, separators=(",", ":"))
    with open(os.path.join(data_dir, "features.json"), "w") as fh:
        json.dump({"type": "FeatureCollection", "features": [
            {"type": "Feature", "properties": {
                "kind": k, "depth_m": d, "relief_m": r, "max_slope_deg": s, "depth_range_m": dr,
                "source": TID_LABELS.get(t) if t is not None else None, "explanation": e,
            }, "geometry": {"type": "Point", "coordinates": [round(x, 6), round(y, 6)]}}
            for k, d, r, s, dr, t, e, x, y in feats
        ]}, fh, separators=(",", ":"))

    # Depth grid for tap-for-depth: int16 elevation then uint8 TID, gzip.
    tmp = os.path.join(out_dir, ".grid")
    os.makedirs(tmp, exist_ok=True)
    arrays = {}
    for name, key in (("elevation", ds[2]), ("tid", ds[3])):
        path = os.path.join(tmp, name + ".tif")
        storage.download_file(key, path)
        with rasterio.open(path) as src:
            arrays[name] = src.read(1)
            transform = src.transform
    elev, tid = arrays["elevation"].astype("<i2"), arrays["tid"].astype(np.uint8)
    with open(os.path.join(data_dir, "grid-gz.txt"), "wb") as fh:
        fh.write(base64.b64encode(gzip.compress(elev.tobytes() + tid.tobytes(), compresslevel=9)))
    for f in os.listdir(tmp):
        os.remove(os.path.join(tmp, f))
    os.rmdir(tmp)

    # Tuna-habitat factor grids for tap explanations (quantised, gzip, base64).
    tuna = next(r for r in pred_rows if r[0] == "tuna_habitat")
    z = np.load(io.BytesIO(storage.get_bytes(tuna[3])))

    def q(a, scale, nan_code):
        out = np.where(np.isfinite(a), np.clip(np.round(a * scale), 0, nan_code - 1), nan_code)
        return out.astype("<u2")

    parts = {
        "score": q(z["score"], 1, 65535), "sst": q(z["sst"], 100, 65535), "front": q(z["front"], 10000, 65535),
        "chl": q(z["chl"], 1000, 65535), "dist_km": q(np.minimum(z["dist_km"], 6000), 10, 65535),
    }
    blob = b"".join(parts[k].tobytes() for k in parts)
    with open(os.path.join(data_dir, "ocean-gz.txt"), "wb") as fh:
        fh.write(base64.b64encode(gzip.compress(blob, compresslevel=9)))
    th, tw = z["score"].shape
    manifest["ocean_grid"] = {
        "width": int(tw), "height": int(th), "west": float(z["west"]), "north": float(z["north"]),
        "res": float(z["res"]), "order": list(parts), "scale": {"score": 1, "sst": 100, "front": 10000, "chl": 1000,
                                                              "dist_km": 10}, "nan": 65535,
    }
    manifest["ocean"] = {
        v: {"observed_at": t.isoformat(), "product": prod, "level": lvl, "kind": kind, "units": u}
        for v, _p, t, prod, lvl, kind, u in ocean_rows
    }
    manifest["predictions"] = {
        m: {"valid_for": vf.isoformat(), "params": params, "validation": val, "version": ver}
        for m, _p, vf, _k, params, val, ver in pred_rows
    }

    manifest["grid"] = {
        "width": int(elev.shape[1]), "height": int(elev.shape[0]),
        "west": transform.c, "north": transform.f, "res": transform.a,
        "tid_labels": {str(k): v for k, v in TID_LABELS.items()},
    }
    manifest["meta"] = {
        "imagery_attribution": s2[1],
        "imagery_from": s2[2].date().isoformat(), "imagery_to": s2[3].date().isoformat(),
        "imagery_scenes": s2[4], "imagery_bounds": s2[5],
        "gebco_citation": ds[4], "gebco_released": ds[5].date().isoformat() if ds[5] else None,
        "gebco_res_m": ds[6], "contours": len(contours), "features": len(feats),
    }
    with open(os.path.join(data_dir, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, separators=(",", ":"))

    with open(os.path.join(HERE, "index.template.html")) as fh:
        html = fh.read()
    with open("/tmp/maplibre-gl.css") as fh:
        css = fh.read()
    html = html.replace("/*MAPLIBRE_CSS*/", css)
    with open(os.path.join(out_dir, "index.html"), "w") as fh:
        fh.write(html)
    total = sum(os.path.getsize(os.path.join(data_dir, f)) for f in os.listdir(data_dir))
    print("files:", len(os.listdir(data_dir)) + 1, "total MB:", round(total / 1e6, 1))
    _ = struct  # noqa: F841


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "preview_build")

"""Cloud-free Sentinel-2 imagery mosaic for the Maldives, built from free Copernicus data.

Copernicus Sentinel-2 data is free and open, including commercial use and offline
redistribution, with attribution ("Contains modified Copernicus Sentinel data").
Scenes are read straight from the public AWS Open Data archive (Element 84 Earth
Search STAC catalogue, Cloud-Optimized GeoTIFFs) with windowed range requests.

Only areas that matter for the app are processed: z12 chunks that contain land, reef
or lagoon (GEBCO depth shallower than 100 m). Each chunk is rendered at ~9.5 m/px
(z14), compositing the per-pixel median of cloud-free observations across scenes,
using the Sentinel-2 Scene Classification (SCL) to drop cloud, cirrus and shadow.

Rendering reads the 16-bit red/green/blue surface-reflectance bands and applies a reef-enhancing
curve (see CURVE_*), so submerged reefs and coral heads are visible rather than near-black.

Run: python -m app.ingestion.sentinel2   (after the GEBCO bathymetry has been ingested)
"""

import io
import os
import time
import traceback
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

import httpx
import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.vrt import WarpedVRT
from scipy import ndimage
from sqlalchemy import select, update

from app.core import storage
from app.ingestion.gebco import JobLog, sync_session_factory
from app.ingestion.raster_tiles import lat_to_tile_y, lon_to_tile_x, tile_bounds_3857
from app.models import (
    BathymetryDataset,
    DataProvider,
    ImageryMosaic,
    IngestionJob,
    JobStatus,
    ProviderStatus,
)

STAC_URL = "https://earth-search.aws.element84.com/v1/search"
COLLECTION = "sentinel-2-c1-l2a"
CHUNK_ZOOM = 12
MAX_ZOOM = 14  # native ~10 m
MIN_ZOOM = 7
CHUNK_PX = 256 * 2 ** (MAX_ZOOM - CHUNK_ZOOM)  # 1024
# SCL classes considered clear surface: vegetation, bare soil, water.
SCL_CLEAR = (4, 5, 6)
SCL_CLOUDY = (3, 8, 9, 10)  # cloud shadow, cloud medium/high probability, thin cirrus
GDAL_ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif",
    "GDAL_HTTP_MULTIRANGE": "YES",
    "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES",
    "GDAL_HTTP_MAX_RETRY": "4",
    "GDAL_HTTP_RETRY_DELAY": "2",
    "VSI_CACHE": "TRUE",
}
ATTRIBUTION = "Contains modified Copernicus Sentinel data {years}, processed by JigMap"


@dataclass(frozen=True)
class MosaicParams:
    months: int = 12
    max_scene_cloud_pct: float = 60.0
    max_scenes_per_chunk: int = 8
    min_clear_obs: int = 4  # stop reading more scenes once every pixel has this many
    percentile: float = 35.0  # below the median: rejects sun glint and haze over water
    cloud_buffer_px: int = 4  # dilate cloud mask (~40 m) to drop cloud edges
    shallow_threshold_m: float = -100.0
    tile_quality: int = 82


# --- pure compositing --------------------------------------------------------------------


def clear_mask(scl: np.ndarray, buffer_px: int) -> np.ndarray:
    cloudy = np.isin(scl, SCL_CLOUDY)
    if buffer_px > 0 and cloudy.any():
        cloudy = ndimage.binary_dilation(cloudy, iterations=buffer_px)
    return np.isin(scl, SCL_CLEAR) & ~cloudy


# Reef-enhancing display curve, tuned on real Maldives scenes: lifts the very low reflectance of
# water so submerged reefs, coral heads and lagoon floors (~0-25 m) become visible, while
# compressing bright sand and land. One curve for land and water, so there are no blend halos.
CURVE_LO = (0.011, 0.010, 0.016)  # R, G, B reflectance mapped to 0 (just below deep-water level)
CURVE_TOP = (0.30, 0.30, 0.30)  # reflectance mapped to 255
CURVE_GAMMA = 0.45


def nan_percentile(a: np.ndarray, q: float, axis: int = 0) -> np.ndarray:
    """Fast nearest-rank percentile ignoring NaN (np.nanpercentile is per-pixel slow).

    Sorting puts NaN last; for each pixel pick rank round(q/100 * (n_valid - 1)).
    """
    srt = np.sort(a, axis=axis)
    n = np.sum(~np.isnan(a), axis=axis, keepdims=True)
    k = np.clip(np.round(q / 100.0 * (n - 1)), 0, None).astype(np.intp)
    out = np.take_along_axis(srt, k, axis=axis).squeeze(axis)
    return np.where(n.squeeze(axis) > 0, out, np.nan)


def composite(
    stack: list[np.ndarray], stack_clear: list[np.ndarray], percentile: float = 35.0
) -> tuple[np.ndarray, np.ndarray, int]:
    """Per-pixel low percentile of clear observations (surface reflectance, NaN = no data).

    A percentile below the median rejects sun glint and thin haze over water better than the
    median. Pixels never observed clear fall back to the same statistic over all valid
    observations. Returns (reflectance 3xHxW float32 with NaN, has_data HxW bool, n_fallback).
    """
    import warnings

    refl = np.stack(stack).astype(np.float32)  # N,3,H,W
    valid = ~np.isnan(refl).any(axis=1)
    clear = np.stack(stack_clear) & valid
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        comp = nan_percentile(np.where(clear[:, None], refl, np.nan), percentile)
        fallback = nan_percentile(np.where(valid[:, None], refl, np.nan), percentile)
    need = np.isnan(comp[0])
    comp[:, need] = fallback[:, need]
    has_data = ~np.isnan(comp[0])
    return comp.astype(np.float32), has_data, int((need & has_data).sum())


def render(comp: np.ndarray, has_data: np.ndarray, sharpen: bool = True) -> tuple[np.ndarray, np.ndarray]:
    """Reflectance composite -> display RGB (HxWx3 uint8) and alpha."""
    lo = np.array(CURVE_LO, np.float32)[:, None, None]
    top = np.array(CURVE_TOP, np.float32)[:, None, None]
    out = 255 * np.clip((np.nan_to_num(comp, nan=0) - lo) / (top - lo), 0, 1) ** CURVE_GAMMA
    rgb = np.moveaxis(out.clip(0, 255).astype(np.uint8), 0, -1)
    if sharpen:
        from PIL import ImageFilter

        rgb = np.asarray(
            Image.fromarray(rgb).filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
        )
    alpha = np.where(has_data, 255, 0).astype(np.uint8)
    return rgb, alpha


def encode_tile(rgb: np.ndarray, alpha: np.ndarray, quality: int) -> bytes | None:
    if not alpha.any():
        return None
    img = Image.fromarray(np.dstack([rgb, alpha]), mode="RGBA")
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=quality, method=4)
    return buf.getvalue()


def downsample(rgb: np.ndarray, alpha: np.ndarray, size: int) -> tuple[np.ndarray, np.ndarray]:
    img = Image.fromarray(np.dstack([rgb, alpha]), mode="RGBA").resize((size, size), Image.Resampling.LANCZOS)
    a = np.asarray(img)
    return a[..., :3].copy(), a[..., 3].copy()


# --- chunk selection ------------------------------------------------------------------------


def chunks_from_bathymetry(elev: np.ndarray, west: float, north: float, res: float, threshold: float) -> list:
    rows, cols = np.nonzero(elev > threshold)
    lats = north - (rows + 0.5) * res
    lons = west + (cols + 0.5) * res
    chunks = {
        (lon_to_tile_x(lo, CHUNK_ZOOM), lat_to_tile_y(la, CHUNK_ZOOM))
        for la, lo in zip(lats, lons, strict=True)
    }
    return sorted(chunks)


def tile_lonlat_bounds(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    import math

    n = 2**z

    def lat(yy):
        return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * yy / n))))

    return x / n * 360 - 180, lat(y + 1), (x + 1) / n * 360 - 180, lat(y)


# --- scene access -----------------------------------------------------------------------------


@dataclass
class Scene:
    id: str
    datetime: str
    cloud: float
    bands: tuple[str, str, str]  # red, green, blue (16-bit surface reflectance COGs)
    scl: str


@dataclass
class ChunkResult:
    x: int
    y: int
    scenes: list[str] = field(default_factory=list)
    dates: list[str] = field(default_factory=list)
    fallback_px: int = 0
    tiles: int = 0
    error: str | None = None


def search_scenes(
    client: httpx.Client, bbox, start: datetime, end: datetime, max_cloud: float
) -> list[Scene]:
    body = {
        "collections": [COLLECTION],
        "bbox": list(bbox),
        "datetime": f"{start:%Y-%m-%dT%H:%M:%SZ}/{end:%Y-%m-%dT%H:%M:%SZ}",
        "limit": 200,
        "query": {"eo:cloud_cover": {"lt": max_cloud}},
        "sortby": [{"field": "properties.eo:cloud_cover", "direction": "asc"}],
    }
    resp = client.post(STAC_URL, json=body)
    resp.raise_for_status()
    out = []
    for f in resp.json().get("features", []):
        a = f["assets"]
        if all(k in a for k in ("red", "green", "blue", "scl")):
            p = f["properties"]
            out.append(
                Scene(
                    f["id"],
                    p["datetime"],
                    float(p.get("eo:cloud_cover", 100)),
                    (a["red"]["href"], a["green"]["href"], a["blue"]["href"]),
                    a["scl"]["href"],
                )
            )
    return sorted(out, key=lambda s: s.cloud)


def read_scene(scene: Scene, bounds3857, size: int) -> tuple[np.ndarray, np.ndarray]:
    """Surface reflectance (3xHxW float32, NaN = no data) and SCL, warped to the chunk grid."""
    transform = from_bounds(*bounds3857, size, size)

    def warp(href, resampling):
        with (
            rasterio.open(href) as src,
            WarpedVRT(
                src, crs="EPSG:3857", transform=transform, width=size, height=size, resampling=resampling
            ) as v,
        ):
            return v.read(1)

    with rasterio.Env(**GDAL_ENV):
        bands = [warp(h, Resampling.bilinear).astype(np.float32) for h in scene.bands]
        scl = warp(scene.scl, Resampling.nearest)
    valid = bands[2] > 0  # 0 = nodata
    # Collection-1 L2A: reflectance = DN * 0.0001 - 0.1
    refl = np.stack([np.where(valid, b * 1e-4 - 0.1, np.nan) for b in bands])
    return refl, scl


SceneReader = Callable[[Scene, tuple, int], tuple[np.ndarray, np.ndarray]]
SceneSearch = Callable[[tuple], list[Scene]]


def build_chunk(x: int, y: int, search: SceneSearch, reader: SceneReader, p: MosaicParams):
    """Returns (ChunkResult, rgb, alpha) for one z12 chunk at z14 resolution."""
    res = ChunkResult(x, y)
    b3857 = tile_bounds_3857(CHUNK_ZOOM, x, y)
    scenes = search(tile_lonlat_bounds(CHUNK_ZOOM, x, y))
    rgbs, clears = [], []
    obs = None
    for s in scenes[: p.max_scenes_per_chunk * 2]:
        if len(rgbs) >= p.max_scenes_per_chunk:
            break
        rgb, scl = reader(s, b3857, CHUNK_PX)
        valid = ~np.isnan(rgb).any(axis=0)
        if not valid.any():
            continue  # chunk outside this scene's footprint
        clear = clear_mask(scl, p.cloud_buffer_px) & valid
        rgbs.append(rgb)
        clears.append(clear)
        res.scenes.append(s.id)
        res.dates.append(s.datetime[:10])
        obs = clear.astype(np.int16) if obs is None else obs + clear
        covered = obs >= p.min_clear_obs
        if covered.all():
            break
    if not rgbs:
        return res, None, None
    comp, has_data, fb = composite(rgbs, clears)
    rgb, alpha = render(comp, has_data)
    res.fallback_px = fb
    return res, rgb, alpha


# --- job ------------------------------------------------------------------------------------------


def run(
    job_id: uuid.UUID,
    params: MosaicParams | None = None,
    chunks: list | None = None,
    search: SceneSearch | None = None,
    reader: SceneReader | None = None,
    workers: int = 8,
) -> uuid.UUID:
    p = params or MosaicParams()
    Session_ = sync_session_factory()
    with Session_() as session:
        job = session.get(IngestionJob, job_id)
        provider = session.get(DataProvider, job.provider_id)
        job.status, job.started_at = JobStatus.running, datetime.now(UTC)
        session.commit()
        log = JobLog(session, job)
        try:
            mosaic_id = _run(session, job, provider, log, p, chunks, search, reader, workers)
            job.status, job.finished_at = JobStatus.succeeded, datetime.now(UTC)
            provider.status, provider.last_success_at, provider.last_error = (
                ProviderStatus.ok,
                job.finished_at,
                None,
            )
            return mosaic_id
        except Exception as exc:
            session.rollback()
            job = session.get(IngestionJob, job_id)
            provider = session.get(DataProvider, job.provider_id)
            job.status, job.finished_at = JobStatus.failed, datetime.now(UTC)
            job.error = f"{type(exc).__name__}: {exc}\n{traceback.format_exc(limit=5)}"
            active = session.scalar(select(ImageryMosaic.id).where(ImageryMosaic.is_active))
            provider.status = ProviderStatus.degraded if active else ProviderStatus.failing
            provider.last_error = f"{type(exc).__name__}: {exc}"
            raise
        finally:
            provider.last_checked_at = datetime.now(UTC)
            session.commit()


def _run(session, job, provider, log, p: MosaicParams, chunks, search, reader, workers) -> uuid.UUID:
    t0 = time.monotonic()
    storage.ensure_bucket()
    end = datetime.now(UTC)
    start = end - timedelta(days=round(p.months * 30.44))
    if chunks is None:
        ds = session.scalar(select(BathymetryDataset).where(BathymetryDataset.is_active))
        if ds is None:
            raise RuntimeError("Ingest GEBCO bathymetry first: it defines where reefs and islands are")
        from app.services.bathymetry import _load_grid_sync

        g = _load_grid_sync(ds).grid
        chunks = chunks_from_bathymetry(g.elevation, g.west, g.north, g.res_deg, p.shallow_threshold_m)
    log(
        f"{len(chunks)} chunks over islands, reefs and lagoons; scenes {start:%Y-%m-%d} to {end:%Y-%m-%d}",
        chunks=len(chunks),
    )

    client = httpx.Client(timeout=httpx.Timeout(60))
    search = search or (lambda bbox: search_scenes(client, bbox, start, end, p.max_scene_cloud_pct))
    reader = reader or read_scene
    mosaic_id = uuid.uuid4()
    prefix = f"imagery/sentinel2/{mosaic_id}"
    level: dict[tuple[int, int], tuple[np.ndarray, np.ndarray]] = {}  # z12 tiles (256 px) for the pyramid
    results: list[ChunkResult] = []
    tiles_written = 0

    def process(xy):
        x, y = xy
        try:
            res, rgb, alpha = build_chunk(x, y, search, reader, p)
        except Exception as exc:  # noqa: BLE001 - recorded per chunk, job continues
            r = ChunkResult(x, y, error=f"{type(exc).__name__}: {exc}")
            return r, None
        if rgb is None:
            return res, None
        n = 0
        # z14 and z13 tiles from the chunk
        for z in (MAX_ZOOM, MAX_ZOOM - 1):
            k = 2 ** (z - CHUNK_ZOOM)
            step = CHUNK_PX // k
            for i in range(k):
                for j in range(k):
                    sub_rgb = rgb[j * step : (j + 1) * step, i * step : (i + 1) * step]
                    sub_a = alpha[j * step : (j + 1) * step, i * step : (i + 1) * step]
                    if step != 256:
                        sub_rgb, sub_a = downsample(sub_rgb, sub_a, 256)
                    data = encode_tile(sub_rgb, sub_a, p.tile_quality)
                    if data:
                        storage.put_bytes(f"{prefix}/{z}/{x * k + i}/{y * k + j}.webp", data, "image/webp")
                        n += 1
        small = downsample(rgb, alpha, 256)
        data = encode_tile(*small, p.tile_quality)
        if data:
            storage.put_bytes(f"{prefix}/{CHUNK_ZOOM}/{x}/{y}.webp", data, "image/webp")
            n += 1
        res.tiles = n
        return res, small

    done = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for res, small in pool.map(process, chunks):
            results.append(res)
            tiles_written += res.tiles
            if small is not None:
                level[(res.x, res.y)] = small
            done += 1
            if done % 50 == 0 or done == len(chunks):
                log(f"chunks {done}/{len(chunks)} composited, {tiles_written} tiles so far")

    # Pyramid z11..z7 from the z12 level.
    for z in range(CHUNK_ZOOM - 1, MIN_ZOOM - 1, -1):
        parents: dict[tuple[int, int], tuple[np.ndarray, np.ndarray]] = {}
        for x, y in {(cx // 2, cy // 2) for cx, cy in level}:
            canvas_rgb = np.zeros((512, 512, 3), np.uint8)
            canvas_a = np.zeros((512, 512), np.uint8)
            for dx in (0, 1):
                for dy in (0, 1):
                    child = level.get((2 * x + dx, 2 * y + dy))
                    if child:
                        canvas_rgb[dy * 256 : (dy + 1) * 256, dx * 256 : (dx + 1) * 256] = child[0]
                        canvas_a[dy * 256 : (dy + 1) * 256, dx * 256 : (dx + 1) * 256] = child[1]
            small = downsample(canvas_rgb, canvas_a, 256)
            data = encode_tile(*small, p.tile_quality)
            if data:
                storage.put_bytes(f"{prefix}/{z}/{x}/{y}.webp", data, "image/webp")
                tiles_written += 1
            parents[(x, y)] = small
        level = parents

    ok = [r for r in results if r.scenes and not r.error]
    failed = [r for r in results if r.error]
    if not ok:
        raise RuntimeError(f"no chunk could be composited ({len(failed)} errors)")
    if len(failed) > 0.05 * len(results):
        raise RuntimeError(f"{len(failed)} of {len(results)} chunks failed; first: {failed[0].error}")
    all_dates = sorted({d for r in ok for d in r.dates})
    scene_ids = sorted({s for r in ok for s in r.scenes})
    years = sorted({d[:4] for d in all_dates})
    years_txt = years[0] if len(years) == 1 else f"{years[0]}–{years[-1]}"
    lon_lat = [tile_lonlat_bounds(CHUNK_ZOOM, r.x, r.y) for r in ok]
    bounds = [
        min(b[0] for b in lon_lat),
        min(b[1] for b in lon_lat),
        max(b[2] for b in lon_lat),
        max(b[3] for b in lon_lat),
    ]
    fallback = sum(r.fallback_px for r in ok)
    mosaic = ImageryMosaic(
        id=mosaic_id,
        provider_id=provider.id,
        job_id=job.id,
        source="Copernicus Sentinel-2 L2A (AWS Open Data, Element 84 Earth Search)",
        attribution=ATTRIBUTION.format(years=years_txt),
        acquired_from=datetime.fromisoformat(all_dates[0]).replace(tzinfo=UTC),
        acquired_to=datetime.fromisoformat(all_dates[-1]).replace(tzinfo=UTC),
        scene_count=len(scene_ids),
        scene_ids=scene_ids,
        chunk_count=len(ok),
        tile_count=tiles_written,
        min_zoom=MIN_ZOOM,
        max_zoom=MAX_ZOOM,
        bounds=bounds,
        tiles_prefix=prefix,
        params={
            **p.__dict__,
            "chunk_zoom": CHUNK_ZOOM,
            "fallback_pixels": fallback,
            "failed_chunks": [f"{r.x},{r.y}: {r.error}" for r in failed][:20],
        },
        is_active=False,
    )
    session.add(mosaic)
    session.flush()
    session.execute(update(ImageryMosaic).where(ImageryMosaic.is_active).values(is_active=False))
    mosaic.is_active = True
    session.commit()
    log(
        f"activated mosaic {mosaic_id}: {len(ok)} chunks, {tiles_written} tiles, {len(scene_ids)} scenes "
        f"acquired {all_dates[0]}..{all_dates[-1]}, {len(failed)} chunk errors, "
        f"{time.monotonic() - t0:.0f}s",
        mosaic_id=str(mosaic_id),
        tiles=tiles_written,
        scenes=len(scene_ids),
        failed_chunks=len(failed),
    )
    return mosaic_id


def create_job(session, params: dict | None = None) -> IngestionJob:
    provider = session.scalar(select(DataProvider).where(DataProvider.slug == "sentinel2"))
    job = IngestionJob(
        provider_id=provider.id, job_type="sentinel2_mosaic", params=params or {}, stats={}, log=[]
    )
    session.add(job)
    session.commit()
    return job


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Build the Sentinel-2 imagery mosaic for the Maldives")
    ap.add_argument(
        "--limit-chunks", type=int, default=None, help="process only the first N chunks (testing)"
    )
    ap.add_argument("--workers", type=int, default=int(os.environ.get("S2_WORKERS", "8")))
    args = ap.parse_args()
    with sync_session_factory()() as s:
        new_job = create_job(s, {"trigger": "cli", "limit_chunks": args.limit_chunks})
    selected = None
    if args.limit_chunks:
        with sync_session_factory()() as s:
            from app.services.bathymetry import _load_grid_sync

            ds = s.scalar(select(BathymetryDataset).where(BathymetryDataset.is_active))
            g = _load_grid_sync(ds).grid
            selected = chunks_from_bathymetry(g.elevation, g.west, g.north, g.res_deg, -100.0)[
                : args.limit_chunks
            ]
    run(new_job.id, chunks=selected, workers=args.workers)

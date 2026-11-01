"""Fishing intelligence layers built from real data, with transparent scoring (no machine learning).

* Tuna habitat (prediction, 0-100): weighted factors on the 0.01 deg SST grid
    - SST in the preferred range of skipjack/yellowfin (MUR SST)
    - nearby thermal front (SST gradient, max within ~5 km)
    - chlorophyll near productive-boundary levels (VIIRS weekly; missing under cloud)
    - distance to seamount / knoll / pinnacle / drop-off candidates (GEBCO-derived)
  Missing factors are left out and the remaining weights renormalised; the point API reports this.
  Lagoons and reef flats (grid depth < 50 m) are excluded: the model is for oceanic tuna.
  Satellites cannot see tuna: this scores conditions, never fish locations.

* Jigging zones (derived analysis): 30-300 m depth on sloping seabed (>= 6 deg on the ~460 m grid),
  the depth band used for vertical and slow-pitch jigging along reef edges and drop-offs.

Not validated against catches yet: the logbook (Phase 5) will provide the records to test it.
"""

import io
import json
import uuid
from datetime import UTC, date, datetime

import numpy as np
from scipy import ndimage
from sqlalchemy import select, update

from app.core import storage
from app.ingestion import analysis
from app.ingestion.gebco import sync_session_factory
from app.ingestion.ocean import publish_tiles, save_grid
from app.models import BathymetryDataset, BathymetryFeature, FishingPrediction, OceanObservation

MODEL_VERSION = "tuna-habitat-0.3"
WEIGHTS = {"front": 0.30, "chl": 0.25, "structure": 0.25, "sst": 0.20}
FACTORS = {
    "sst": "Trapezoid: 0 below 20 C, rising to 1 at 24 C, 1 up to 29.5 C, easing to 0.6 at 31.5 C "
    "(skipjack/yellowfin surface preference; warmer surface water pushes tuna deeper).",
    "front": "Strongest SST gradient within ~4 km (smoothed), scaled so 0.06 C/km or more scores 1 "
    "(thermal fronts concentrate prey).",
    "chl": "Bell curve in log space centred on 0.2 mg/m3 (sd 0.35 decades): productive-boundary water "
    "in the oligotrophic Indian Ocean; very clear or very green water scores lower. Not used within "
    "~4 km of water shallower than 30 m, where seabed reflection biases satellite chlorophyll.",
    "structure": "exp(-distance / 8 km) to the nearest seamount, knoll, pinnacle or drop-off candidate "
    "(underwater structure aggregates baitfish).",
}
HABITAT_STOPS = np.array(
    [
        [0, 74, 20, 140, 0],
        [35, 74, 20, 140, 0],
        [45, 106, 27, 154, 90],
        [60, 173, 20, 87, 150],
        [72, 255, 111, 0, 190],
        [85, 255, 214, 0, 225],
        [100, 255, 255, 141, 235],
    ],
    np.float32,
)
JIG_STOPS = np.array(
    [
        [0, 118, 255, 3, 0],
        [29, 118, 255, 3, 0],
        [30, 178, 255, 89, 150],
        [90, 118, 255, 3, 160],
        [160, 0, 230, 118, 165],
        [300, 0, 191, 165, 170],
        [301, 0, 191, 165, 0],
    ],
    np.float32,
)


def sst_score(t):
    return np.interp(t, [20, 24, 29.5, 31.5], [0, 1, 1, 0.6], left=0, right=0.6)


def chl_score(c):
    with np.errstate(all="ignore"):
        return np.exp(-0.5 * ((np.log10(c) - np.log10(0.2)) / 0.35) ** 2)


def front_score(front, radius_cells: int = 4, full_at: float = 0.06):
    """Strongest SST gradient within a round neighbourhood (~radius), softened to avoid edges."""
    yy, xx = np.mgrid[-radius_cells : radius_cells + 1, -radius_cells : radius_cells + 1]
    disk = np.hypot(yy, xx) <= radius_cells
    near = ndimage.grey_dilation(np.nan_to_num(front, nan=0), footprint=disk)
    near = ndimage.gaussian_filter(near, radius_cells / 2)
    return np.clip(near / full_at, 0, 1)


def structure_score(dist_km):
    return np.exp(-dist_km / 8.0)


def combine(factors: dict[str, np.ndarray]) -> tuple[np.ndarray, np.ndarray]:
    """Weighted mean over available (finite) factors -> (score 0-100, weight used 0-1)."""
    num = np.zeros_like(next(iter(factors.values())), dtype=np.float64)
    den = np.zeros_like(num)
    for k, v in factors.items():
        ok = np.isfinite(v)
        num += np.where(ok, WEIGHTS[k] * v, 0)
        den += np.where(ok, WEIGHTS[k], 0)
    with np.errstate(all="ignore"):
        score = np.where(den > 0, 100 * num / den, np.nan)
    return score.astype(np.float32), den.astype(np.float32)


def resample_to(src: np.ndarray, sw, sn, sres, lats, lons) -> np.ndarray:
    """Nearest-cell lookup of a lat/lon grid at target cell centres."""
    r = np.floor((sn - lats) / sres).astype(int)
    c = np.floor((lons - sw) / sres).astype(int)
    ok_r = (r >= 0) & (r < src.shape[0])
    ok_c = (c >= 0) & (c < src.shape[1])
    out = src[np.clip(r, 0, src.shape[0] - 1)][:, np.clip(c, 0, src.shape[1] - 1)].astype(np.float32)
    out[~ok_r, :] = np.nan
    out[:, ~ok_c] = np.nan
    return out


def smooth_resample_log(src, sw, sn, sres, lats, lons) -> np.ndarray:
    """Bilinear resampling of log10(chl) with NaN-aware smoothing; NaN where no data nearby."""
    logc = np.log10(np.where(src > 0, src, np.nan))
    ok = np.isfinite(logc)
    num = ndimage.gaussian_filter(np.where(ok, logc, 0), 0.8)
    den = ndimage.gaussian_filter(ok.astype(float), 0.8)
    with np.errstate(all="ignore"):
        filled = np.where(den > 0.25, num / den, np.nan)
    r = (sn - lats) / sres - 0.5
    c = (lons - sw) / sres - 0.5
    rr, cc = np.meshgrid(r, c, indexing="ij")
    vals = ndimage.map_coordinates(np.nan_to_num(filled, nan=-9), [rr, cc], order=1, mode="nearest")
    mask = (
        ndimage.map_coordinates(np.isfinite(filled).astype(float), [rr, cc], order=1, mode="constant") > 0.5
    )
    return np.where(mask & (vals > -8), 10.0**vals, np.nan).astype(np.float32)


def load_npz(key: str) -> tuple[np.ndarray, float, float, float]:
    z = np.load(io.BytesIO(storage.get_bytes(key)))
    return z["data"], float(z["west"]), float(z["north"]), float(z["res"])


def build(session) -> list[uuid.UUID]:
    obs = {o.variable: o for o in session.scalars(select(OceanObservation).where(OceanObservation.is_latest))}
    ds = session.scalar(select(BathymetryDataset).where(BathymetryDataset.is_active))
    if ds is None or "sst" not in obs:
        raise RuntimeError("needs active bathymetry and SST observations")
    from app.services.bathymetry import _load_grid_sync

    g = _load_grid_sync(ds).grid
    sst, w, n, res = load_npz(obs["sst"].grid_key)
    front, *_ = load_npz(obs["sst_front"].grid_key)
    h, wd = sst.shape
    lats = n - (np.arange(h) + 0.5) * res
    lons = w + (np.arange(wd) + 0.5) * res
    depth_elev = resample_to(g.elevation, g.west, g.north, g.res_deg, lats, lons)
    if "chl" in obs:
        chl_src, cw, cn, cres = load_npz(obs["chl"].grid_key)
        chl_obs = smooth_resample_log(chl_src, cw, cn, cres, lats, lons)  # as observed (for display)
        chl = chl_obs
        # Optically shallow water: seabed reflection inflates satellite chlorophyll near reefs.
        shallow = np.isfinite(depth_elev) & (depth_elev > -30)
        near_shallow = ndimage.binary_dilation(shallow, iterations=4)  # ~4 km at 0.01 deg
        chl = np.where(near_shallow, np.nan, chl)
    else:
        chl = np.full_like(sst, np.nan)
        chl_obs = chl

    # Distance (km) to the nearest structure candidate, on the SST grid.
    mask = np.zeros(sst.shape, bool)
    for fx, fy in session.execute(
        select(BathymetryFeature.geom.ST_X(), BathymetryFeature.geom.ST_Y()).where(
            BathymetryFeature.dataset_id == ds.id
        )
    ):
        r, c = int((n - fy) / res), int((fx - w) / res)
        if 0 <= r < h and 0 <= c < wd:
            mask[r, c] = True
    km_y = res * analysis.M_PER_DEG_LAT / 1000
    km_x = res * analysis.M_PER_DEG_LON_EQ * np.cos(np.radians(np.mean(lats))) / 1000
    dist = (
        ndimage.distance_transform_edt(~mask, sampling=(km_y, km_x)).astype(np.float32)
        if mask.any()
        else np.full(sst.shape, np.inf, np.float32)
    )

    factors = {
        "sst": np.where(np.isfinite(sst), sst_score(sst), np.nan),
        "front": np.where(np.isfinite(sst), front_score(front), np.nan),
        "chl": np.where(np.isfinite(chl), chl_score(chl), np.nan),
        "structure": structure_score(dist),
    }
    score, used = combine(factors)
    oceanic = np.isfinite(depth_elev) & (depth_elev <= -50)
    score = np.where(oceanic & np.isfinite(sst), score, np.nan).astype(np.float32)

    valid_for = obs["sst"].observed_at.date()
    created = []
    batch = uuid.uuid4().hex[:12]
    prefix = f"fishing/tuna_habitat/{valid_for:%Y%m%d}-{batch}"
    buf = io.BytesIO()
    np.savez_compressed(
        buf,
        score=score,
        sst=sst,
        front=front,
        chl=chl,
        dist_km=dist,
        weight_used=used,
        # The exact factor scores combined into `score`, so explanations show what was really used.
        f_sst=factors["sst"].astype(np.float32),
        f_front=factors["front"].astype(np.float32),
        f_chl=factors["chl"].astype(np.float32),
        f_structure=factors["structure"].astype(np.float32),
        chl_obs=chl_obs,
        west=w,
        north=n,
        res=res,
    )
    storage.put_bytes(f"{prefix}/grid.npz", buf.getvalue(), "application/octet-stream")
    from app.ingestion.ocean import colorize

    ntiles = publish_tiles(f"{prefix}/tiles", score, w, n, res, colorize(HABITAT_STOPS), range(4, 10))
    finite = score[np.isfinite(score)]
    inputs = {
        k: {"id": str(o.id), "observed_at": o.observed_at.isoformat(), "product": o.product}
        for k, o in obs.items()
    }
    inputs["bathymetry"] = {"id": str(ds.id), "version": ds.version}
    tid = uuid.uuid4()
    session.execute(
        update(FishingPrediction)
        .where(FishingPrediction.model == "tuna_habitat", FishingPrediction.is_latest)
        .values(is_latest=False)
    )
    session.add(
        FishingPrediction(
            id=tid,
            model="tuna_habitat",
            model_version=MODEL_VERSION,
            valid_for=valid_for,
            inputs=inputs,
            params={"weights": WEIGHTS, "factors": FACTORS, "excluded": "grid depth shallower than 50 m"},
            stats={
                "cells": int(finite.size),
                "median": float(np.median(finite)),
                "p90": float(np.percentile(finite, 90)),
                "share_chl_missing": float(np.mean(~np.isfinite(chl[oceanic]))),
            },
            validation={
                "status": "not_validated",
                "reason": "No catch records yet; the logbook (Phase 5) will provide them.",
            },
            grid_key=f"{prefix}/grid.npz",
            tiles_prefix=f"{prefix}/tiles",
            tile_count=ntiles,
            is_latest=True,
        )
    )
    session.commit()
    created.append(tid)

    # Jigging zones from GEBCO (static per bathymetry release).
    slope = analysis.slope_degrees(g)
    depth = -g.elevation
    zone = np.where((depth >= 30) & (depth <= 300) & (slope >= 6.0), depth, np.nan).astype(np.float32)
    jprefix = f"fishing/jigging_zones/{ds.version}-{batch}"
    save_grid(f"{jprefix}/grid.npz", zone, g.west, g.north, g.res_deg)
    jt = publish_tiles(
        f"{jprefix}/tiles", zone, g.west, g.north, g.res_deg, colorize(JIG_STOPS), range(4, 11)
    )
    jid = uuid.uuid4()
    session.execute(
        update(FishingPrediction)
        .where(FishingPrediction.model == "jigging_zones", FishingPrediction.is_latest)
        .values(is_latest=False)
    )
    session.add(
        FishingPrediction(
            id=jid,
            model="jigging_zones",
            model_version="jigging-zones-0.1",
            valid_for=(ds.source_last_modified or datetime.now(UTC)).date(),
            inputs={"bathymetry": {"id": str(ds.id), "version": ds.version}},
            params={
                "depth_m": [30, 300],
                "min_slope_deg": 6.0,
                "explanation": (
                    "30-300 m on sloping seabed (>= 6 deg on the ~460 m GEBCO grid): the depth band "
                    "used for vertical and slow-pitch jigging along reef edges and drop-offs."
                ),
            },
            stats={"cells": int(np.isfinite(zone).sum())},
            validation={"status": "not_validated", "reason": "No catch records yet."},
            grid_key=f"{jprefix}/grid.npz",
            tiles_prefix=f"{jprefix}/tiles",
            tile_count=jt,
            is_latest=True,
        )
    )
    session.commit()
    created.append(jid)
    print(
        json.dumps({"tuna_tiles": ntiles, "jig_tiles": jt, "tuna_median": float(np.median(finite))}),
        flush=True,
    )
    return created


def main() -> None:
    with sync_session_factory()() as s:
        build(s)


if __name__ == "__main__":
    _ = date
    main()

"""Serving ocean observations and fishing predictions (tiles, point values, provenance)."""

import asyncio
import io
import threading
import uuid

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.ingestion.fishing import FACTORS, WEIGHTS, hotspots_geojson
from app.models import FishingPrediction, OceanObservation
from app.services.bathymetry import _LRU

OBS_LAYERS = ("sst", "chl", "sst_front")
PRED_LAYERS = ("tuna_habitat", "jigging_zones")
_tiles = _LRU(4000)
_grids: dict[uuid.UUID, dict] = {}
_lock = threading.Lock()


async def latest(db: AsyncSession) -> tuple[dict[str, OceanObservation], dict[str, FishingPrediction]]:
    obs = {
        o.variable: o for o in (await db.scalars(select(OceanObservation).where(OceanObservation.is_latest)))
    }
    pred = {
        p.model: p for p in (await db.scalars(select(FishingPrediction).where(FishingPrediction.is_latest)))
    }
    return obs, pred


async def tile(prefix: str, z: int, x: int, y: int) -> bytes | None:
    key = f"{prefix}/{z}/{x}/{y}.png"
    hit = _tiles.get(key)
    if hit is not None:
        return hit or None
    data = await asyncio.to_thread(storage.get_bytes, key)
    _tiles.put(key, data if data is not None else b"")
    return data


def _load(rec_id: uuid.UUID, key: str) -> dict:
    with _lock:
        if rec_id not in _grids:
            z = np.load(io.BytesIO(storage.get_bytes(key)))
            _grids[rec_id] = {k: z[k] for k in z.files}
            if len(_grids) > 12:
                _grids.pop(next(iter(_grids)))
        return _grids[rec_id]


def _sample(g: dict, name: str, lat: float, lon: float) -> float | None:
    a = g[name]
    r = int(np.floor((float(g["north"]) - lat) / float(g["res"])))
    c = int(np.floor((lon - float(g["west"])) / float(g["res"])))
    if 0 <= r < a.shape[0] and 0 <= c < a.shape[1]:
        v = float(a[r, c])
        return v if np.isfinite(v) else None
    return None


def obs_summary(o: OceanObservation) -> dict:
    return {
        "variable": o.variable,
        "units": o.units,
        "data_kind": o.data_kind,
        "product": o.product,
        "product_level": o.product_level,
        "observed_at": o.observed_at.isoformat(),
        "resolution_deg": o.resolution_deg,
        "stats": o.stats,
        "source_url": o.source_url,
    }


def pred_summary(p: FishingPrediction) -> dict:
    return {
        "model": p.model,
        "model_version": p.model_version,
        "data_kind": "prediction" if p.model == "tuna_habitat" else "derived_analysis",
        "valid_for": p.valid_for.isoformat(),
        "inputs": p.inputs,
        "params": p.params,
        "stats": p.stats,
        "validation": p.validation,
    }


async def point(db: AsyncSession, lat: float, lon: float) -> dict:
    obs, pred = await latest(db)
    out: dict = {
        "query": {"lat": lat, "lon": lon},
        "observations": {},
        "tuna_habitat": None,
        "jigging_zone": None,
    }
    for name, o in obs.items():
        g = await asyncio.to_thread(_load, o.id, o.grid_key)
        out["observations"][name] = {
            "value": _sample(g, "data", lat, lon),
            "units": o.units,
            "observed_at": o.observed_at.isoformat(),
            "data_kind": o.data_kind,
            "product_level": o.product_level,
        }
    if "tuna_habitat" in pred:
        p = pred["tuna_habitat"]
        g = await asyncio.to_thread(_load, p.id, p.grid_key)
        score = _sample(g, "score", lat, lon)
        sst, chl = _sample(g, "sst", lat, lon), _sample(g, "chl", lat, lon)
        dist = _sample(g, "dist_km", lat, lon)
        # Factor scores are read from the grids the model actually combined (never recomputed here).
        factors = {
            "sst": {"value": sst, "units": "degC", "score": _sample(g, "f_sst", lat, lon)},
            "front": {
                "value": _sample(g, "front", lat, lon),
                "units": "degC/km at this point",
                "score": _sample(g, "f_front", lat, lon),
                "note": "The score uses the strongest front within ~4 km, not only this point.",
            },
            "chl": {
                "value": chl,
                "units": "mg m-3",
                "score": _sample(g, "f_chl", lat, lon),
                "note": None
                if chl is not None
                else "Not used here: within ~4 km of water shallower than 30 m.",
            },
            "structure": {
                "value": dist,
                "units": "km to nearest candidate",
                "score": _sample(g, "f_structure", lat, lon),
            },
        }
        for k, f in factors.items():
            f["weight"] = WEIGHTS[k]
            f["definition"] = FACTORS[k]
        out["tuna_habitat"] = {
            "score": None if score is None else round(score),
            "excluded": score is None,
            "factors": factors,
            "valid_for": p.valid_for.isoformat(),
            "model_version": p.model_version,
            "data_kind": "prediction",
            "validation": p.validation,
            "statement": "Potential habitat from ocean conditions. Satellites cannot see tuna; this is not a "
            "fish location.",
        }
    if "jigging_zones" in pred:
        p = pred["jigging_zones"]
        g = await asyncio.to_thread(_load, p.id, p.grid_key)
        d = _sample(g, "data", lat, lon)
        out["jigging_zone"] = {
            "in_zone": d is not None,
            "depth_m": d,
            "definition": p.params.get("explanation"),
            "data_kind": "derived_analysis",
        }
    return out


_hot: dict[uuid.UUID, dict] = {}


async def hotspots(db: AsyncSession) -> dict | None:
    _, pred = await latest(db)
    p = pred.get("tuna_habitat")
    if p is None:
        return None
    if p.id not in _hot:
        g = await asyncio.to_thread(_load, p.id, p.grid_key)
        _hot.clear()
        _hot[p.id] = await asyncio.to_thread(hotspots_geojson, g)
    return {**_hot[p.id], "valid_for": p.valid_for.isoformat(), "model_version": p.model_version}

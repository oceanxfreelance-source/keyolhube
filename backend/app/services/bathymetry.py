"""Serving GEBCO-derived bathymetry: depth queries, vector/raster tiles, features."""

import asyncio
import os
import threading
import uuid
from collections import OrderedDict
from dataclasses import dataclass

import numpy as np
import rasterio
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.config import get_settings
from app.ingestion import analysis
from app.ingestion.analysis import Grid
from app.models import BathymetryDataset

DISCLAIMER = (
    "GEBCO is a ~460 m interpolated compilation, not a nautical chart. Do not use for navigation "
    "or to judge safe clearance; real depths at reefs and pinnacles can differ by tens of metres."
)


async def active_dataset(db: AsyncSession) -> BathymetryDataset | None:
    return await db.scalar(select(BathymetryDataset).where(BathymetryDataset.is_active))


# --- In-memory grid for point queries -----------------------------------------------------


@dataclass
class LoadedGrid:
    dataset_id: uuid.UUID
    grid: Grid
    tid: np.ndarray


_grids: dict[uuid.UUID, LoadedGrid] = {}
_grid_lock = threading.Lock()


def _load_grid_sync(ds: BathymetryDataset) -> LoadedGrid:
    with _grid_lock:
        if ds.id in _grids:
            return _grids[ds.id]
        cache_dir = os.path.join(get_settings().data_dir, "grids", str(ds.id))
        os.makedirs(cache_dir, exist_ok=True)
        paths = {}
        for name, key in (("elevation", ds.grid_key), ("tid", ds.tid_key)):
            path = os.path.join(cache_dir, f"{name}.tif")
            if not os.path.exists(path):
                storage.download_file(key, path + ".part")
                os.replace(path + ".part", path)
            paths[name] = path
        with rasterio.open(paths["elevation"]) as src:
            elev = src.read(1).astype(np.float32)
            west, north, res = src.transform.c, src.transform.f, src.transform.a
        with rasterio.open(paths["tid"]) as src:
            tid = src.read(1)
        _grids.clear()  # keep only the active dataset in memory
        loaded = LoadedGrid(ds.id, Grid(elev, west, north, res), tid)
        _grids[ds.id] = loaded
        return loaded


async def load_grid(ds: BathymetryDataset) -> LoadedGrid:
    if ds.id in _grids:
        return _grids[ds.id]
    return await asyncio.to_thread(_load_grid_sync, ds)


def depth_at(loaded: LoadedGrid, lat: float, lon: float) -> dict | None:
    g = loaded.grid
    cell = g.cell_of(lat, lon)
    if cell is None:
        return None
    r, c = cell
    elev = float(g.elevation[r, c])
    code = int(loaded.tid[r, c])
    # Local slope from the 3x3 neighbourhood (same method as the slope layer).
    r0, r1, c0, c1 = max(r - 1, 0), min(r + 2, g.height), max(c - 1, 0), min(c + 2, g.width)
    sub = Grid(g.elevation[r0:r1, c0:c1], g.west + c0 * g.res_deg, g.north - r0 * g.res_deg, g.res_deg)
    slope = float(analysis.slope_degrees(sub)[r - r0, c - c0]) if sub.height > 1 and sub.width > 1 else None
    return {
        "elevation_m": elev,
        "depth_m": round(-elev, 1) if elev < 0 else None,
        "is_land_or_above_sea_level": elev >= 0,
        "slope_deg": round(slope, 1) if slope is not None else None,
        "cell": {
            "row": r,
            "col": c,
            "centre_lat": round(g.north - (r + 0.5) * g.res_deg, 6),
            "centre_lon": round(g.west + (c + 0.5) * g.res_deg, 6),
            "size_m_approx": round(g.res_deg * analysis.M_PER_DEG_LAT),
        },
        "source": {
            "tid": code,
            "label": analysis.TID_LABELS.get(code, f"TID {code}"),
            "category": analysis.tid_category(code),
        },
    }


# --- Contour vector tiles -------------------------------------------------------------------


def contour_levels_for_zoom(z: int) -> list[int]:
    if z <= 5:
        return [200, 1000, 2000, 3000, 4000, 5000]
    if z <= 7:
        return [50, 100, 200, 500, 1000, 2000, 3000, 4000, 5000]
    if z <= 9:
        return [20, 30, 50, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000]
    return [10, 20, 30, 50, 75, 100, 150, 200, 300, 400, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000]


_MVT_SQL = text(
    """
    WITH b AS (SELECT ST_TileEnvelope(:z, :x, :y) AS env),
    mvt AS (
      SELECT c.depth_m,
             ST_AsMVTGeom(ST_Transform(c.geom, 3857), b.env, 4096, 64, true) AS geom
      FROM bathymetry_contours c, b
      WHERE c.dataset_id = :ds
        AND c.depth_m = ANY(:levels)
        AND c.geom && ST_Transform(b.env, 4326)
    )
    SELECT ST_AsMVT(mvt.*, 'contours', 4096, 'geom') FROM mvt WHERE geom IS NOT NULL
    """
)


async def contour_tile(db: AsyncSession, ds_id: uuid.UUID, z: int, x: int, y: int) -> bytes:
    result = await db.scalar(
        _MVT_SQL, {"z": z, "x": x, "y": y, "ds": ds_id, "levels": contour_levels_for_zoom(z)}
    )
    return bytes(result or b"")


# --- Raster tiles from object storage (small LRU) -------------------------------------------


class _LRU:
    def __init__(self, max_items: int):
        self.max, self.items = max_items, OrderedDict()
        self.lock = threading.Lock()

    def get(self, k):
        with self.lock:
            if k in self.items:
                self.items.move_to_end(k)
                return self.items[k]
        return None

    def put(self, k, v):
        with self.lock:
            self.items[k] = v
            self.items.move_to_end(k)
            while len(self.items) > self.max:
                self.items.popitem(last=False)


_tile_cache = _LRU(4000)
_MISSING = b""


async def raster_tile(ds: BathymetryDataset, layer: str, z: int, x: int, y: int) -> bytes | None:
    key = f"{ds.tiles_prefix}/{layer}/{z}/{x}/{y}.png"
    hit = _tile_cache.get(key)
    if hit is not None:
        return hit or None
    data = await asyncio.to_thread(storage.get_bytes, key)
    _tile_cache.put(key, data if data is not None else _MISSING)
    return data

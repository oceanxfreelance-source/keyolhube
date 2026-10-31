"""Self-built imagery mosaics (Sentinel-2): metadata and tile access."""

import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.models import ImageryMosaic
from app.services.bathymetry import _LRU

_cache = _LRU(6000)
_MISSING = b""


async def active_mosaic(db: AsyncSession) -> ImageryMosaic | None:
    return await db.scalar(select(ImageryMosaic).where(ImageryMosaic.is_active))


async def mosaic_tile(m: ImageryMosaic, z: int, x: int, y: int) -> bytes | None:
    if not (m.min_zoom <= z <= m.max_zoom):
        return None
    key = f"{m.tiles_prefix}/{z}/{x}/{y}.webp"
    hit = _cache.get(key)
    if hit is not None:
        return hit or None
    data = await asyncio.to_thread(storage.get_bytes, key)
    _cache.put(key, data if data is not None else _MISSING)
    return data


def summary(m: ImageryMosaic) -> dict:
    return {
        "id": str(m.id),
        "source": m.source,
        "attribution": m.attribution,
        "data_kind": "imagery_mosaic",
        "acquired_from": m.acquired_from.date().isoformat(),
        "acquired_to": m.acquired_to.date().isoformat(),
        "scene_count": m.scene_count,
        "chunk_count": m.chunk_count,
        "tile_count": m.tile_count,
        "zoom": [m.min_zoom, m.max_zoom],
        "resolution_m": 10,
        "bounds": m.bounds,
        "built_at": m.created_at.isoformat(),
        "licence": (
            "Copernicus Sentinel data: free and open; commercial use and offline storage "
            "permitted with attribution."
        ),
    }

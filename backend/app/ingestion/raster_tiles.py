"""Render Web-Mercator PNG tiles (depth shading, slope) from the lat/lon grid.

Depth shading is deliberately translucent in shallow water so reefs and islands
in the satellite imagery stay visible underneath; land is fully transparent.
"""

import io
import math
import warnings
from collections.abc import Iterator

import numpy as np
import rasterio.errors
from PIL import Image
from rasterio.crs import CRS
from rasterio.transform import from_bounds, from_origin
from rasterio.warp import Resampling, reproject

from app.ingestion.analysis import Grid

# Transforms are passed explicitly; rasterio still warns about its internal MEM datasets.
warnings.filterwarnings("ignore", category=rasterio.errors.NotGeoreferencedWarning)

TILE = 256
WEB_MERCATOR_HALF = 20037508.342789244
EPSG4326 = CRS.from_epsg(4326)
EPSG3857 = CRS.from_epsg(3857)

# depth (m, positive down) -> (R, G, B, A)
DEPTH_STOPS = np.array(
    [
        [0, 130, 235, 245, 0],
        [10, 100, 215, 240, 25],
        [30, 70, 180, 225, 80],
        [100, 40, 130, 205, 135],
        [300, 28, 90, 175, 165],
        [1000, 16, 55, 135, 185],
        [2500, 10, 33, 98, 198],
        [5000, 5, 16, 56, 210],
    ],
    dtype=np.float32,
)
# slope (deg) -> (R, G, B, A)
SLOPE_STOPS = np.array(
    [
        [0, 255, 235, 59, 0],
        [5, 255, 235, 59, 0],
        [8, 255, 214, 0, 90],
        [15, 255, 145, 0, 160],
        [25, 244, 67, 54, 200],
        [40, 183, 28, 28, 220],
    ],
    dtype=np.float32,
)


def lon_to_tile_x(lon: float, z: int) -> int:
    return int((lon + 180.0) / 360.0 * (1 << z))


def lat_to_tile_y(lat: float, z: int) -> int:
    lat = max(min(lat, 85.0511), -85.0511)
    return int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * (1 << z))


def tile_bounds_3857(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    size = 2 * WEB_MERCATOR_HALF / (1 << z)
    west = -WEB_MERCATOR_HALF + x * size
    north = WEB_MERCATOR_HALF - y * size
    return west, north - size, west + size, north


def tiles_for_bounds(
    west: float, south: float, east: float, north: float, z: int
) -> Iterator[tuple[int, int]]:
    x0, x1 = lon_to_tile_x(west, z), lon_to_tile_x(east - 1e-9, z)
    y0, y1 = lat_to_tile_y(north, z), lat_to_tile_y(south + 1e-9, z)
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            yield x, y


def _ramp(values: np.ndarray, stops: np.ndarray) -> np.ndarray:
    out = np.empty(values.shape + (4,), dtype=np.float32)
    for i in range(4):
        out[..., i] = np.interp(values, stops[:, 0], stops[:, i + 1])
    return out


class TileRenderer:
    def __init__(self, grid: Grid, slope: np.ndarray, shade: np.ndarray):
        self.grid = grid
        self.src_transform = from_origin(grid.west, grid.north, grid.res_deg, grid.res_deg)
        self.bands = np.stack(
            [grid.elevation.astype(np.float32), shade.astype(np.float32), slope.astype(np.float32)]
        )

    def _warp(self, z: int, x: int, y: int) -> np.ndarray:
        dst = np.full((3, TILE, TILE), np.nan, dtype=np.float32)
        self._reproject(z, x, y, dst)
        return dst

    def _reproject(self, z: int, x: int, y: int, dst: np.ndarray) -> None:
        reproject(
            source=self.bands,
            destination=dst,
            src_transform=self.src_transform,
            src_crs=EPSG4326,
            src_nodata=np.nan,
            dst_transform=from_bounds(*tile_bounds_3857(z, x, y), TILE, TILE),
            dst_crs=EPSG3857,
            dst_nodata=np.nan,
            resampling=Resampling.bilinear,
        )

    def render(self, z: int, x: int, y: int) -> dict[str, bytes]:
        """Return {'depth': png, 'slope': png}; a layer is omitted when its tile would be empty."""
        elev, shade, slope = self._warp(z, x, y)
        valid = ~np.isnan(elev)
        ocean = valid & (elev < 0)
        if not ocean.any():
            return {}
        depth = np.where(ocean, -elev, 0)

        rgba = _ramp(depth, DEPTH_STOPS)
        # Hillshade relief: flat seabed (~0.71 illumination) keeps its colour.
        factor = np.clip(0.55 + 0.65 * np.nan_to_num(shade, nan=0.707), 0.6, 1.25)
        rgba[..., :3] *= factor[..., None]
        rgba[..., 3] = np.where(ocean, rgba[..., 3], 0)
        out = {"depth": _png(rgba)}

        srgba = _ramp(np.nan_to_num(slope, nan=0), SLOPE_STOPS)
        srgba[..., 3] = np.where(ocean, srgba[..., 3], 0)
        if srgba[..., 3].max() > 0:
            out["slope"] = _png(srgba)
        return out


def _png(rgba: np.ndarray) -> bytes:
    img = Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), mode="RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


class ScalarTileRenderer:
    """Render one float grid (lat/lon, NaN = missing) to coloured Web-Mercator PNG tiles."""

    def __init__(self, data: np.ndarray, west: float, north: float, res: float, colour):
        self.data = data.astype(np.float32)[None]
        self.transform = from_origin(west, north, res, res)
        self.colour = colour

    def render(self, z: int, x: int, y: int) -> bytes | None:
        dst = np.full((1, TILE, TILE), np.nan, dtype=np.float32)
        reproject(
            source=self.data,
            destination=dst,
            src_transform=self.transform,
            src_crs=EPSG4326,
            src_nodata=np.nan,
            dst_transform=from_bounds(*tile_bounds_3857(z, x, y), TILE, TILE),
            dst_crs=EPSG3857,
            dst_nodata=np.nan,
            resampling=Resampling.bilinear,
        )
        rgba = self.colour(dst[0])
        if rgba[..., 3].max() <= 0:
            return None
        return _png(rgba)

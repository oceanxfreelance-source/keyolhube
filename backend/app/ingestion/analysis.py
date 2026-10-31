"""Terrain analysis on a regular lat/lon elevation grid (GEBCO convention: metres, positive up).

All functions are pure numpy/scipy so they can be unit-tested. Outputs are
*candidates* derived from a ~460 m interpolated grid: they describe the shape of
the grid, not verified underwater structures, and the explanations say so.
"""

from dataclasses import dataclass, field

import contourpy
import numpy as np
from scipy import ndimage
from shapely.geometry import LineString

M_PER_DEG_LAT = 110_574.0
M_PER_DEG_LON_EQ = 111_320.0

# Official GEBCO Type Identifier (TID) codes (GEBCO Grid documentation, Table 2).
TID_LABELS: dict[int, str] = {
    0: "Land",
    10: "Single beam echo-sounder",
    11: "Multibeam echo-sounder",
    12: "Seismic",
    13: "Isolated sounding",
    14: "ENC sounding",
    15: "Lidar",
    16: "Optical light sensor",
    17: "Combination of direct measurement methods",
    40: "Predicted from satellite-derived gravity",
    41: "Interpolated by computer algorithm",
    42: "Digital bathymetric contours from charts",
    43: "Digital bathymetric contours from ENCs",
    44: "Bathymetric depths from multiple sources",
    45: "Predicted from flight-derived gravity",
    46: "Grounded iceberg draft",
    47: "Grounded Argo float",
    48: "Animal-borne data logger",
    70: "Pre-generated grid",
    71: "Unknown source",
    72: "Steering points",
}
DIRECT_MEASUREMENT_TIDS = set(range(10, 18))


def tid_category(code: int) -> str:
    if code == 0:
        return "land"
    if code in DIRECT_MEASUREMENT_TIDS:
        return "direct_measurement"
    if 40 <= code <= 48:
        return "indirect_or_interpolated"
    return "unknown_or_pre_generated"


@dataclass(frozen=True)
class Grid:
    """Pixel-centre registered grid. Row 0 is the northernmost row."""

    elevation: np.ndarray  # float32, metres, positive up
    west: float  # west edge of column 0
    north: float  # north edge of row 0
    res_deg: float

    @property
    def height(self) -> int:
        return self.elevation.shape[0]

    @property
    def width(self) -> int:
        return self.elevation.shape[1]

    def lon_centres(self) -> np.ndarray:
        return self.west + (np.arange(self.width) + 0.5) * self.res_deg

    def lat_centres(self) -> np.ndarray:
        return self.north - (np.arange(self.height) + 0.5) * self.res_deg

    def cell_of(self, lat: float, lon: float) -> tuple[int, int] | None:
        col = int(np.floor((lon - self.west) / self.res_deg))
        row = int(np.floor((self.north - lat) / self.res_deg))
        if 0 <= row < self.height and 0 <= col < self.width:
            return row, col
        return None


def cell_spacing_m(grid: Grid) -> tuple[np.ndarray, float]:
    """(dx per row, dy) in metres."""
    dx = grid.res_deg * M_PER_DEG_LON_EQ * np.cos(np.radians(grid.lat_centres()))
    dy = grid.res_deg * M_PER_DEG_LAT
    return dx.astype(np.float64), dy


def slope_degrees(grid: Grid) -> np.ndarray:
    z = grid.elevation.astype(np.float64)
    dx, dy = cell_spacing_m(grid)
    dz_dy, dz_dx = np.gradient(z)
    gx = dz_dx / dx[:, None]
    gy = dz_dy / dy
    return np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)


def hillshade(
    grid: Grid, azimuth: float = 315.0, altitude: float = 45.0, z_factor: float = 1.0
) -> np.ndarray:
    """0..1 illumination, standard Horn-style formulation."""
    z = grid.elevation.astype(np.float64) * z_factor
    dx, dy = cell_spacing_m(grid)
    dz_dy, dz_dx = np.gradient(z)
    gx = dz_dx / dx[:, None]
    gy = -dz_dy / dy  # rows run north->south
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    az = np.radians(360.0 - azimuth + 90.0)
    alt = np.radians(altitude)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    return np.clip(shade, 0, 1).astype(np.float32)


# --- Contours --------------------------------------------------------------------------


@dataclass
class ContourLine:
    depth_m: int
    coords: list[tuple[float, float]]  # (lon, lat)


def contour_lines(grid: Grid, depths_m: list[int], simplify_deg: float | None = None) -> list[ContourLine]:
    """Isobaths at the given depths (positive down)."""
    gen = contourpy.contour_generator(
        x=grid.lon_centres(), y=grid.lat_centres(), z=grid.elevation.astype(np.float64), name="serial"
    )
    tol = grid.res_deg / 4 if simplify_deg is None else simplify_deg
    out: list[ContourLine] = []
    for depth in depths_m:
        for seg in gen.lines(-float(depth)):
            if len(seg) < 2:
                continue
            line = LineString(seg)
            if tol > 0:
                line = line.simplify(tol, preserve_topology=False)
            if line.length == 0 or len(line.coords) < 2:
                continue
            out.append(ContourLine(depth, [(round(x, 6), round(y, 6)) for x, y in line.coords]))
    return out


# --- Candidate features -----------------------------------------------------------------


@dataclass
class FeatureCandidate:
    kind: str
    row: int
    col: int
    lat: float
    lon: float
    depth_m: float
    relief_m: float | None = None
    max_slope_deg: float | None = None
    depth_range_m: tuple[float, float] | None = None
    source_tid: int | None = None
    properties: dict = field(default_factory=dict)
    explanation: str = ""


@dataclass(frozen=True)
class DropOffParams:
    min_slope_deg: float = 15.0
    min_depth_m: float = 15.0
    max_depth_m: float = 1500.0
    spacing_cells: int = 7  # ~3 km between candidates along the same edge
    window_cells: int = 2  # depth range sampled within +/- this many cells


def _tid_text(tid: np.ndarray | None, r: int, c: int) -> tuple[int | None, str]:
    if tid is None:
        return None, "unknown source"
    code = int(tid[r, c])
    return code, f"{TID_LABELS.get(code, f'TID {code}')} (TID {code})"


def drop_off_candidates(
    grid: Grid, slope: np.ndarray, tid: np.ndarray | None = None, p: DropOffParams | None = None
) -> list[FeatureCandidate]:
    p = p or DropOffParams()
    z = grid.elevation
    depth = -z
    mask = (z < 0) & (slope >= p.min_slope_deg) & (depth >= p.min_depth_m) & (depth <= p.max_depth_m)
    if not mask.any():
        return []
    local_max = ndimage.maximum_filter(np.where(mask, slope, 0), size=p.spacing_cells) == slope
    rows, cols = np.nonzero(mask & local_max)
    lats, lons = grid.lat_centres(), grid.lon_centres()
    res_m = grid.res_deg * M_PER_DEG_LAT
    out = []
    w = p.window_cells
    for r, c in zip(rows.tolist(), cols.tolist(), strict=True):
        win = z[max(r - w, 0) : r + w + 1, max(c - w, 0) : c + w + 1]
        ocean = win[win < 0]
        shallow, deep = float(-ocean.max()), float(-ocean.min())
        code, src = _tid_text(tid, r, c)
        span_km = (2 * w + 1) * res_m / 1000
        out.append(
            FeatureCandidate(
                kind="drop_off",
                row=r,
                col=c,
                lat=float(lats[r]),
                lon=float(lons[c]),
                depth_m=round(float(depth[r, c]), 1),
                max_slope_deg=round(float(slope[r, c]), 1),
                depth_range_m=(round(shallow, 1), round(deep, 1)),
                source_tid=code,
                explanation=(
                    f"Steep gradient in the grid: about {slope[r, c]:.0f}° at ~{depth[r, c]:.0f} m; "
                    f"depth changes from {shallow:.0f} m to {deep:.0f} m within ~{span_km:.1f} km. "
                    f"Derived from the GEBCO grid (~{res_m:.0f} m cells), which smooths real reef walls. "
                    f"Grid source here: {src}. Candidate only: confirm with your echo sounder."
                ),
            )
        )
    return out


@dataclass(frozen=True)
class RiseParams:
    min_summit_depth_m: float = 5.0  # ignore anything shallower (reef flats, rims)
    min_relief_m: float = 30.0
    # Share of the surrounding ring that must be clearly deeper than the summit. 0.97 rejects
    # ridges and reef rims that merely cross the ring (they cover ~8–30% of it).
    enclosure: float = 0.97
    scales_cells: tuple[int, ...] = (3, 10)  # annulus inner radius; outer = 2x
    # Deep, low-relief bumps (mostly in gravity-predicted areas) are noise for fishing use.
    max_summit_depth_by_kind: tuple[tuple[str, float], ...] = (("pinnacle", 500.0), ("knoll", 1500.0))
    max_candidates: int = 2000


def classify_rise(relief_m: float) -> str:
    # IHO/IOC undersea feature terminology: seamount >= 1000 m relief, knoll < 1000 m.
    if relief_m >= 1000:
        return "seamount"
    if relief_m >= 200:
        return "knoll"
    return "pinnacle"


def rise_candidates(
    grid: Grid, tid: np.ndarray | None = None, p: RiseParams | None = None
) -> list[FeatureCandidate]:
    """Isolated local highs on the seafloor, surrounded on (almost) all sides by deeper water."""
    p = p or RiseParams()
    z = grid.elevation.astype(np.float32)
    lats, lons = grid.lat_centres(), grid.lon_centres()
    res_m = grid.res_deg * M_PER_DEG_LAT
    found: dict[tuple[int, int], FeatureCandidate] = {}
    for r_in in p.scales_cells:
        r_out = 2 * r_in
        is_peak = (ndimage.maximum_filter(z, size=2 * r_in + 1) == z) & (z <= -p.min_summit_depth_m)
        yy, xx = np.mgrid[-r_out : r_out + 1, -r_out : r_out + 1]
        dist = np.hypot(yy, xx)
        annulus = (dist >= r_in) & (dist <= r_out)
        disk = dist <= r_out
        for r, c in zip(*np.nonzero(is_peak), strict=True):
            r, c = int(r), int(c)
            if r < r_out or c < r_out or r >= grid.height - r_out or c >= grid.width - r_out:
                continue  # need the full surroundings inside the grid
            window = z[r - r_out : r + r_out + 1, c - r_out : c + r_out + 1]
            ring = window[annulus]
            summit = float(z[r, c])
            if (window[disk] >= 0).any():
                continue  # land/islands within the search radius: not an isolated seafloor rise
            base = float(np.median(ring))
            relief = summit - base
            if relief < p.min_relief_m:
                continue
            if np.mean(ring <= summit - relief / 2) < p.enclosure:
                continue  # a ridge or reef rim, not an isolated rise
            prev = found.get((r, c))
            if prev is not None and (prev.relief_m or 0) >= relief:
                continue
            kind = classify_rise(relief)
            if -summit > dict(p.max_summit_depth_by_kind).get(kind, float("inf")):
                continue
            code, src = _tid_text(tid, r, c)
            found[(r, c)] = FeatureCandidate(
                kind=kind,
                row=r,
                col=c,
                lat=float(lats[r]),
                lon=float(lons[c]),
                depth_m=round(-summit, 1),
                relief_m=round(relief, 1),
                source_tid=code,
                properties={"scale_km": round(r_out * res_m / 1000, 1)},
                explanation=(
                    f"Possible {kind}: grid summit ~{-summit:.0f} m deep, rising ~{relief:.0f} m above the "
                    f"surrounding seabed (median depth {-base:.0f} m within "
                    f"{r_in * res_m / 1000:.1f}–{r_out * res_m / 1000:.1f} km). "
                    f"GEBCO cells are ~{res_m:.0f} m, so true summit depth and shape can differ a lot. "
                    f"Grid source here: {src}. Candidate only: confirm with your echo sounder."
                ),
            )
    ranked = sorted(found.values(), key=lambda f: f.relief_m or 0, reverse=True)
    return ranked[: p.max_candidates]

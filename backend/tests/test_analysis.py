"""Unit tests of the terrain analysis on synthetic shapes with known answers."""

import math

import numpy as np

from app.ingestion import analysis
from app.ingestion.analysis import DropOffParams, Grid, RiseParams

RES = 1 / 240


def make_grid(z: np.ndarray, west=73.0, north=4.0) -> Grid:
    return Grid(z.astype(np.float32), west, north, RES)


def test_slope_of_known_plane():
    # Elevation drops 100 m per cell eastwards; cell width ~ 463.8 m * cos(lat).
    z = -1000 - 100 * np.tile(np.arange(50), (50, 1))
    g = make_grid(z, north=0.1)
    s = analysis.slope_degrees(g)
    dx = RES * analysis.M_PER_DEG_LON_EQ * math.cos(math.radians(0.0))
    expected = math.degrees(math.atan(100 / dx))
    assert abs(float(s[25, 25]) - expected) < 0.2


def test_contours_of_cone_are_closed_rings():
    yy, xx = np.mgrid[-60:60, -60:60]
    z = -1000 + 10 * (60 - np.hypot(yy, xx))  # summit -400 m, flanks to below -1000
    lines = analysis.contour_lines(make_grid(z), [500, 700])
    assert {ln.depth_m for ln in lines} == {500, 700}
    for ln in lines:
        assert ln.coords[0] == ln.coords[-1]  # closed


def test_drop_off_found_on_steep_edge_only():
    z = np.full((60, 60), -20.0)
    z[:, 30:] = -800.0  # 780 m step between columns 29 and 30
    g = make_grid(z)
    cands = analysis.drop_off_candidates(g, analysis.slope_degrees(g), None, DropOffParams())
    assert cands
    assert all(28 <= c.col <= 31 for c in cands)
    assert all(c.max_slope_deg >= 15 for c in cands)
    assert "Candidate only" in cands[0].explanation


def test_isolated_rise_detected_and_classified():
    yy, xx = np.mgrid[-50:50, -50:50]
    z = -900 + 700 * np.exp(-((np.hypot(yy, xx) / 3) ** 2))  # summit ~ -200 m, 700 m above seabed
    tid = np.full(z.shape, 40, dtype=np.uint8)
    cands = analysis.rise_candidates(make_grid(z), tid, RiseParams())
    assert len(cands) == 1
    c = cands[0]
    assert (c.row, c.col) == (50, 50)
    assert c.kind == "knoll"
    assert 600 < c.relief_m < 720
    assert c.source_tid == 40 and "satellite-derived gravity" in c.explanation


def test_ridge_and_land_are_not_rises():
    z = np.full((100, 100), -1500.0)
    z[:, 48:52] = -100.0  # long ridge: not enclosed
    assert analysis.rise_candidates(make_grid(z)) == []
    yy, xx = np.mgrid[-50:50, -50:50]
    z2 = -900 + 700 * np.exp(-((np.hypot(yy, xx) / 3) ** 2))
    z2[50, 54] = 5.0  # an island ~1.9 km away, inside every search radius
    assert analysis.rise_candidates(make_grid(z2)) == []


def test_deep_low_relief_bump_is_filtered():
    yy, xx = np.mgrid[-50:50, -50:50]
    z = -2500 + 80 * np.exp(-((np.hypot(yy, xx) / 3) ** 2))  # 80 m bump at 2400 m: noise for fishing
    assert analysis.rise_candidates(make_grid(z)) == []


def test_classify_rise_thresholds():
    assert analysis.classify_rise(1000) == "seamount"
    assert analysis.classify_rise(999) == "knoll"
    assert analysis.classify_rise(150) == "pinnacle"


def test_cell_lookup_is_pixel_centre_registered():
    g = make_grid(np.zeros((10, 10)))
    assert g.cell_of(4.0 - RES / 2, 73.0 + RES / 2) == (0, 0)
    assert g.cell_of(4.0 + 0.001, 73.0) is None
    assert analysis.tid_category(11) == "direct_measurement"
    assert analysis.tid_category(40) == "indirect_or_interpolated"

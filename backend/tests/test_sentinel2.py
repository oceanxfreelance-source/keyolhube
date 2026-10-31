"""Sentinel-2 mosaic: compositing maths, chunk selection and the full job with a stand-in archive.

The real archive was exercised live (see docs/data-sources.md); here the remote reader is
replaced by a test double so the pipeline runs offline and deterministically.
"""

import uuid

import numpy as np

from app.ingestion import sentinel2 as s2


def _scene(value, h=8, w=8):
    return np.full((3, h, w), value, np.float32)


def test_clear_mask_drops_cloud_and_buffers_edges():
    scl = np.full((9, 9), 6, np.uint8)  # water
    scl[4, 4] = 9  # cloud
    m = s2.clear_mask(scl, buffer_px=1)
    assert not m[4, 4] and not m[3, 4] and not m[4, 5]  # cloud + 1 px buffer removed
    assert m[0, 0]
    assert not s2.clear_mask(np.full((3, 3), 3, np.uint8), 0).any()  # cloud shadow


def test_composite_uses_low_percentile_of_clear_observations():
    stack = [_scene(0.02), _scene(0.04), _scene(0.5)]  # 0.5 = cloud
    clears = [np.ones((8, 8), bool), np.ones((8, 8), bool), np.zeros((8, 8), bool)]
    comp, has, fb = s2.composite(stack, clears, percentile=100)
    assert comp.shape == (3, 8, 8)
    assert abs(float(comp[0, 0, 0]) - 0.04) < 1e-6  # brightest *clear* value: the 0.5 cloud is excluded
    assert has.all() and fb == 0
    low, _, _ = s2.composite(stack, clears, percentile=0)
    assert abs(float(low[0, 0, 0]) - 0.02) < 1e-6  # lower percentile favours the darker (glint-free) view


def test_nan_percentile_matches_numpy_on_nearest_rank():
    rng = np.random.default_rng(1)
    a = rng.random((7, 3, 5, 5)).astype(np.float32)
    a[rng.random(a.shape) < 0.3] = np.nan
    a[:, :, 0, 0] = np.nan
    got = s2.nan_percentile(a, 35)
    want = np.nanpercentile(a, 35, axis=0, method="nearest")
    assert np.allclose(np.nan_to_num(got, nan=-1), np.nan_to_num(want, nan=-1))


def test_composite_falls_back_when_never_clear_and_marks_nodata():
    a, b, c = _scene(0.03), _scene(0.04), _scene(0.2)
    a[:, 0, 0] = b[:, 0, 0] = c[:, 0, 0] = np.nan  # outside all footprints
    never = [np.zeros((8, 8), bool)] * 3
    comp, has, fb = s2.composite([a, b, c], never, percentile=50)
    assert abs(float(comp[0, 1, 1]) - 0.04) < 1e-6
    assert not has[0, 0] and has[1, 1]
    assert fb == 63


def test_render_lifts_underwater_contrast():
    deep, reef, sand = 0.012, 0.045, 0.19  # typical blue-band reflectance in the Maldives
    comp = np.stack([np.array([[deep, reef, sand]], np.float32)] * 3)
    rgb, alpha = s2.render(comp, np.ones((1, 3), bool), sharpen=False)
    b = rgb[0, :, 2].astype(int)
    assert b[0] < b[1] < b[2]
    assert b[1] - b[0] >= 50  # a submerged reef stands out clearly from deep water
    assert alpha.all()


def test_chunks_cover_only_shallow_areas():
    elev = np.full((240, 240), -3000.0, np.float32)
    elev[100:110, 100:110] = -20.0  # a small reef ~1 degree from the grid corner
    chunks = s2.chunks_from_bathymetry(elev, 73.0, 5.0, 1 / 240, -100.0)
    assert 1 <= len(chunks) <= 2
    lon, lat = 73.0 + 105 / 240, 5.0 - 105 / 240
    boxes = [s2.tile_lonlat_bounds(s2.CHUNK_ZOOM, *c) for c in chunks]
    assert any(w <= lon <= e and s <= lat <= n for w, s, e, n in boxes)


def _fake_reader(scene, bounds, size):
    # Cloud on the left half in scene "a", clear everywhere in "b".
    refl = np.full((3, size, size), 0.03 if scene.id == "a" else 0.05, np.float32)
    scl = np.full((size, size), 6, np.uint8)
    if scene.id == "a":
        refl[:, :, : size // 2] = 0.6
        scl[:, : size // 2] = 9
    return refl, scl


def _fake_search(bbox):
    return [
        s2.Scene("a", "2026-03-01T05:00:00Z", 5, "a.tif", "a_scl.tif"),
        s2.Scene("b", "2026-06-01T05:00:00Z", 12, "b.tif", "b_scl.tif"),
    ]


def build_test_mosaic() -> uuid.UUID:
    from app.ingestion.raster_tiles import lat_to_tile_y, lon_to_tile_x

    chunks = [(lon_to_tile_x(73.51, 12), lat_to_tile_y(4.18, 12))]
    with s2.sync_session_factory()() as s:
        job = s2.create_job(s, {"trigger": "test"})
    return s2.run(job.id, chunks=chunks, search=_fake_search, reader=_fake_reader, workers=1)


def test_full_job_writes_tiles_and_activates(_database):
    from app.core import storage
    from app.models import ImageryMosaic

    storage.reset_client()
    mosaic_id = build_test_mosaic()
    with s2.sync_session_factory()() as s:
        m = s.get(ImageryMosaic, mosaic_id)
        assert m.is_active and m.scene_count == 2 and m.chunk_count == 1
        assert m.tile_count == 16 + 4 + 1 + 5  # z14, z13, z12 and pyramid z11..z7
        assert m.acquired_from.date().isoformat() == "2026-03-01"
        assert "Copernicus Sentinel data 2026" in m.attribution
        # The chunk's own z12 tile: cloudy left half uses only the clear scene (0.05),
        # right half the 35th percentile (nearest rank) of both clear observations (0.03).
        import io

        from PIL import Image

        from app.ingestion.raster_tiles import lat_to_tile_y, lon_to_tile_x

        x, y = lon_to_tile_x(73.51, 12), lat_to_tile_y(4.18, 12)
        img = np.asarray(
            Image.open(io.BytesIO(storage.get_bytes(f"{m.tiles_prefix}/12/{x}/{y}.webp"))).convert("RGBA")
        )
        exp = s2.render(np.array([[[0.05, 0.03]]] * 3, np.float32), np.ones((1, 2), bool), sharpen=False)[0][
            0
        ]
        assert abs(int(img[128, 30, 0]) - int(exp[0, 0])) <= 6
        assert abs(int(img[128, 220, 0]) - int(exp[1, 0])) <= 6
        assert img[..., 3].min() == 255

"""Sentinel-2 mosaic: compositing maths, chunk selection and the full job with a stand-in archive.

The real archive was exercised live (see docs/data-sources.md); here the remote reader is
replaced by a test double so the pipeline runs offline and deterministically.
"""

import uuid

import numpy as np

from app.ingestion import sentinel2 as s2


def _scene(value, h=8, w=8):
    return np.full((3, h, w), value, np.uint8)


def test_clear_mask_drops_cloud_and_buffers_edges():
    scl = np.full((9, 9), 6, np.uint8)  # water
    scl[4, 4] = 9  # cloud
    m = s2.clear_mask(scl, buffer_px=1)
    assert not m[4, 4] and not m[3, 4] and not m[4, 5]  # cloud + 1 px buffer removed
    assert m[0, 0]
    assert not s2.clear_mask(np.full((3, 3), 3, np.uint8), 0).any()  # cloud shadow


def test_composite_is_median_of_clear_observations():
    rgbs = [_scene(10), _scene(20), _scene(250)]  # 250 = cloud
    clears = [np.ones((8, 8), bool), np.ones((8, 8), bool), np.zeros((8, 8), bool)]
    rgb, alpha, fb = s2.composite(rgbs, clears)
    assert rgb.shape == (8, 8, 3)
    assert int(rgb[0, 0, 0]) == 15  # median of 10 and 20; cloudy 250 excluded
    assert alpha.all() and fb == 0


def test_composite_falls_back_when_never_clear_and_marks_nodata():
    a, b, c = _scene(30), _scene(40), _scene(200)
    a[:, 0, 0] = b[:, 0, 0] = c[:, 0, 0] = 0  # outside all footprints
    never = [np.zeros((8, 8), bool)] * 3
    rgb, alpha, fb = s2.composite([a, b, c], never)
    assert int(rgb[1, 1, 0]) == 40  # median of all valid observations
    assert alpha[0, 0] == 0 and alpha[1, 1] == 255
    assert fb == 63


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
    rgb = np.full((3, size, size), 60 if scene.id == "a" else 80, np.uint8)
    scl = np.full((size, size), 6, np.uint8)
    if scene.id == "a":
        rgb[:, :, : size // 2] = 250
        scl[:, : size // 2] = 9
    return rgb, scl


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
        # The chunk's own z12 tile: cloudy left half replaced by the clear scene (80),
        # right half = median of both clear observations (70).
        import io

        from PIL import Image

        from app.ingestion.raster_tiles import lat_to_tile_y, lon_to_tile_x

        x, y = lon_to_tile_x(73.51, 12), lat_to_tile_y(4.18, 12)
        img = np.asarray(
            Image.open(io.BytesIO(storage.get_bytes(f"{m.tiles_prefix}/12/{x}/{y}.webp"))).convert("RGBA")
        )
        assert abs(int(img[128, 30, 0]) - 80) <= 4
        assert abs(int(img[128, 220, 0]) - 70) <= 4
        assert img[..., 3].min() == 255

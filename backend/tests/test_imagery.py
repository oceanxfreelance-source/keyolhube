"""Serving the Sentinel-2 mosaic and protecting free tiers of keyed imagery providers."""

import pytest

from app.core.config import get_settings
from app.ingestion.raster_tiles import lat_to_tile_y, lon_to_tile_x
from tests.conftest import unique_email
from tests.test_sentinel2 import build_test_mosaic

ESRI_PUBLIC = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
X, Y = lon_to_tile_x(73.51, 12), lat_to_tile_y(4.18, 12)


@pytest.fixture(scope="module")
def mosaic(_database):
    return build_test_mosaic()


async def test_sentinel2_is_served_with_its_provenance(client, mosaic, monkeypatch):
    monkeypatch.setenv("SATELLITE_PROVIDER", "sentinel2_jigmap")
    get_settings.cache_clear()
    cfg = (await client.get("/api/v1/map/config")).json()
    assert cfg["basemap"]["id"] == "sentinel2_jigmap"
    assert cfg["basemap"]["licence_status"] == "open_commercial"
    assert cfg["basemap"]["offline_caching"] == "permitted"
    assert cfg["basemap"]["imagery_ready"] is True
    assert "Copernicus Sentinel data 2026" in cfg["basemap"]["attribution"]
    assert cfg["imagery"]["acquired_from"] == "2026-03-01" and cfg["imagery"]["data_kind"] == "imagery_mosaic"

    style = (await client.get("/api/v1/map/style.json")).json()
    sat = style["sources"]["satellite"]
    assert sat["tiles"][0].endswith("/api/v1/imagery/tiles/{z}/{x}/{y}.webp")
    assert sat["minzoom"] == 7 and len(sat["bounds"]) == 4

    r = await client.get(f"/api/v1/imagery/tiles/12/{X}/{Y}.webp")
    assert r.status_code == 200 and r.headers["content-type"] == "image/webp"
    assert (await client.get("/api/v1/imagery/tiles/12/0/0.webp")).status_code == 204
    assert (await client.get("/api/v1/imagery/tiles/3/9/0.webp")).status_code == 400

    status = (await client.get("/api/v1/map/provider-status")).json()
    assert status["reachable"] is True

    active = (await client.get("/api/v1/imagery/mosaics/active")).json()
    assert active["scene_count"] == 2 and "commercial use" in active["licence"]


async def test_free_tier_cap_switches_to_sentinel2(client, mosaic, monkeypatch):
    monkeypatch.setenv("SATELLITE_PROVIDER", "custom_xyz")
    monkeypatch.setenv("CUSTOM_XYZ_URL", ESRI_PUBLIC + "?k=SERVER-SIDE")
    monkeypatch.setenv("IMAGERY_MONTHLY_TILE_CAP", "2")
    get_settings.cache_clear()
    pw = "correct-horse-battery"
    email = unique_email("cap")
    await client.post("/api/v1/auth/register", json={"email": email, "password": pw})
    token = (await client.post("/api/v1/auth/login", json={"email": email, "password": pw})).json()[
        "access_token"
    ]
    style = (await client.get("/api/v1/map/style.json", headers={"Authorization": f"Bearer {token}"})).json()
    t = style["sources"]["satellite"]["tiles"][0].split("?t=")[1]

    first = await client.get(f"/api/v1/map/tiles/12/{X}/{Y}?t={t}")
    second = await client.get(f"/api/v1/map/tiles/12/{X}/{Y}?t={t}")
    assert first.status_code == second.status_code == 200
    assert "x-imagery-fallback" not in first.headers  # real upstream tiles (needs internet)
    third = await client.get(f"/api/v1/map/tiles/12/{X}/{Y}?t={t}")
    assert third.headers["x-imagery-fallback"] == "sentinel2"
    assert third.headers["content-type"] == "image/webp"

    cfg = (await client.get("/api/v1/map/config")).json()
    assert cfg["imagery_usage"]["tiles_this_month"] == 3
    assert cfg["imagery_usage"]["monthly_cap"] == 2
    assert cfg["imagery_usage"]["fallback"] == "sentinel2_jigmap"

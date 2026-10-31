import pytest
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.services.basemap import lonlat_to_tile, resolve_provider
from tests.conftest import unique_email

ESRI_PUBLIC = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"


def test_lonlat_to_tile_male():
    # Malé at z10 -> tile 721/500 (standard slippy-map formula)
    assert lonlat_to_tile(73.5093, 4.1755, 10) == (721, 500)
    assert lonlat_to_tile(-180, 85.05, 0) == (0, 0)


def test_dev_provider_refused_in_production():
    with pytest.raises(ValidationError, match="development only"):
        Settings(environment="production", jwt_secret="x" * 40, satellite_provider="esri_public_dev")


def test_keyed_provider_without_key_is_not_configured():
    from app.services.basemap import ProviderNotConfigured

    with pytest.raises(ProviderNotConfigured):
        resolve_provider(Settings(satellite_provider="maptiler_satellite", maptiler_api_key=""))


async def test_config_and_public_style(client):
    cfg = (await client.get("/api/v1/map/config")).json()
    assert cfg["basemap"]["licence_status"] == "development_only"
    assert cfg["basemap"]["data_kind"] == "imagery_mosaic"
    style = (await client.get("/api/v1/map/style.json")).json()
    assert style["version"] == 8
    assert style["sources"]["satellite"]["tiles"] == [ESRI_PUBLIC]
    assert style["sources"]["satellite"]["attribution"]


async def test_unconfigured_provider_returns_503(client, monkeypatch):
    monkeypatch.setenv("SATELLITE_PROVIDER", "mapbox_satellite")
    monkeypatch.setenv("MAPBOX_ACCESS_TOKEN", "")
    get_settings.cache_clear()
    r = await client.get("/api/v1/map/style.json")
    assert r.status_code == 503
    assert "MAPBOX_ACCESS_TOKEN" in r.json()["detail"]


async def test_keyed_provider_uses_proxy_and_hides_key(client, monkeypatch):
    # custom_xyz is treated as keyed; point it at a real imagery endpoint with a fake "secret" param.
    monkeypatch.setenv("SATELLITE_PROVIDER", "custom_xyz")
    monkeypatch.setenv("CUSTOM_XYZ_URL", ESRI_PUBLIC + "?secret=SERVER-SIDE-ONLY")
    monkeypatch.setenv("CUSTOM_XYZ_ATTRIBUTION", "Imagery © Esri")
    get_settings.cache_clear()

    assert (await client.get("/api/v1/map/style.json")).status_code == 401  # sign-in required

    email = unique_email()
    pw = "correct-horse-battery"
    await client.post("/api/v1/auth/register", json={"email": email, "password": pw})
    access = (await client.post("/api/v1/auth/login", json={"email": email, "password": pw})).json()[
        "access_token"
    ]
    r = await client.get("/api/v1/map/style.json", headers={"Authorization": f"Bearer {access}"})
    assert r.status_code == 200
    assert "SERVER-SIDE-ONLY" not in r.text
    tiles = r.json()["sources"]["satellite"]["tiles"][0]
    assert "/api/v1/map/tiles/{z}/{x}/{y}?t=" in tiles

    token = tiles.split("?t=")[1]
    assert (await client.get("/api/v1/map/tiles/10/721/500?t=forged-token-123")).status_code == 401
    assert (await client.get(f"/api/v1/map/tiles/3/9/0?t={token}")).status_code == 400  # x out of range

    # Real upstream fetch through the proxy (needs internet access).
    r = await client.get(f"/api/v1/map/tiles/10/721/500?t={token}")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("image/")
    assert len(r.content) > 1000


async def test_provider_status_live(client):
    body = (await client.get("/api/v1/map/provider-status")).json()
    assert body["provider"] == "esri_public_dev"
    assert body["reachable"] is True, body  # requires internet access

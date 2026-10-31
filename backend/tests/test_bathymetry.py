"""Pipeline + API integration tests on a real excerpt of the GEBCO 2026 grid (Malé atolls).

The `ingested_dataset` fixture runs the production ingestion pipeline (validation, GeoTIFFs in
S3, contours/features in PostGIS, tiles, offline package, activation) on that excerpt.
"""

import hashlib
import io
import json
import zipfile

import numpy as np
from sqlalchemy import text

from tests.conftest import unique_email

PW = "correct-horse-battery"


async def _token(client, role: str | None = None) -> str:
    email = unique_email("bathy")
    await client.post("/api/v1/auth/register", json={"email": email, "password": PW})
    if role:
        from app.db.session import get_sessionmaker

        async with get_sessionmaker()() as s:
            await s.execute(text("UPDATE users SET role=:r WHERE email=:e"), {"r": role, "e": email})
            await s.commit()
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": PW})
    return r.json()["access_token"]


async def test_pipeline_records_provenance_and_job(client, ingested_dataset):
    r = await client.get("/api/v1/bathymetry/datasets/active")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == str(ingested_dataset["id"])
    assert body["version"] == "GEBCO_2026"
    assert "10.5285/4f68d5c7" in body["citation"]
    assert body["data_kind"] == "historical_compilation"
    assert body["grid"] == {"width": 120, "height": 120}
    assert body["resolution"]["arcsec"] == 15.0
    assert "40" in body["source_types"] and "gravity" in body["source_types"]["40"]["label"]
    assert "not a nautical chart" in body["disclaimer"]

    providers = {p["slug"]: p for p in (await client.get("/api/v1/data-providers")).json()}
    assert providers["gebco"]["status"] == "ok"
    assert providers["copernicus_marine"]["status"] == "not_connected"
    assert providers["marine_weather"]["status"] == "not_connected"


async def test_depth_query_matches_the_grid(client, ingested_dataset):
    fx = np.load("tests/fixtures/gebco2026_male_excerpt.npz")
    b = ingested_dataset["bounds"]
    # Pick the deepest cell of the excerpt and query its centre.
    r_, c_ = np.unravel_index(np.argmin(fx["elevation"]), fx["elevation"].shape)
    lat = b["north"] - (r_ + 0.5) / 240
    lon = b["west"] + (c_ + 0.5) / 240
    r = await client.get("/api/v1/bathymetry/depth", params={"lat": lat, "lon": lon})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["depth_m"] == -float(fx["elevation"][r_, c_])
    assert d["source"]["tid"] == int(fx["tid"][r_, c_])
    assert d["not_for_navigation"] is True
    assert d["cell"]["size_m_approx"] == 461

    out = await client.get("/api/v1/bathymetry/depth", params={"lat": 10.0, "lon": 73.5})
    assert out.status_code == 404
    bad = await client.get("/api/v1/bathymetry/depth", params={"lat": 100, "lon": 73.5})
    assert bad.status_code == 422


async def test_contour_vector_tiles(client, ingested_dataset):
    # z10 tile over Malé atoll
    from app.ingestion.raster_tiles import lat_to_tile_y, lon_to_tile_x

    x, y = lon_to_tile_x(73.5, 10), lat_to_tile_y(4.2, 10)
    r = await client.get(f"/api/v1/bathymetry/contours/10/{x}/{y}.pbf")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/vnd.mapbox-vector-tile"
    assert b"contours" in r.content and b"depth_m" in r.content
    empty = await client.get("/api/v1/bathymetry/contours/10/0/0.pbf")
    assert empty.status_code == 204
    assert (await client.get("/api/v1/bathymetry/contours/3/9/0.pbf")).status_code == 400


async def test_raster_tiles(client, ingested_dataset):
    from app.ingestion.raster_tiles import lat_to_tile_y, lon_to_tile_x

    x, y = lon_to_tile_x(73.5, 9), lat_to_tile_y(4.2, 9)
    r = await client.get(f"/api/v1/bathymetry/tiles/depth/9/{x}/{y}.png")
    assert r.status_code == 200 and r.content[:8] == b"\x89PNG\r\n\x1a\n"
    assert (await client.get("/api/v1/bathymetry/tiles/depth/9/0/0.png")).status_code == 204
    assert (await client.get(f"/api/v1/bathymetry/tiles/nope/9/{x}/{y}.png")).status_code == 422


async def test_features_are_candidates_with_explanations(client, ingested_dataset):
    fc = (await client.get("/api/v1/bathymetry/features.geojson")).json()
    assert fc["type"] == "FeatureCollection"
    assert fc["features"], "the Malé excerpt has steep outer reef slopes"
    kinds = {f["properties"]["kind"] for f in fc["features"]}
    assert "drop_off" in kinds
    fid = fc["features"][0]["id"]
    detail = (await client.get(f"/api/v1/bathymetry/features/{fid}")).json()
    assert detail["is_candidate"] is True
    assert detail["data_kind"] == "derived_analysis"
    assert "Candidate only" in detail["explanation"]
    only = (await client.get("/api/v1/bathymetry/features.geojson", params={"kind": "seamount"})).json()
    assert all(f["properties"]["kind"] == "seamount" for f in only["features"])
    assert (await client.get("/api/v1/bathymetry/features.geojson", params={"bbox": "x"})).status_code == 422


async def test_style_includes_bathymetry_layers_with_provenance(client, ingested_dataset):
    style = (await client.get("/api/v1/map/style.json")).json()
    ids = [layer["id"] for layer in style["layers"]]
    assert ids[:2] == ["background", "satellite"]
    for lid in ["bathymetry-depth", "bathymetry-slope", "bathymetry-contours", "bathymetry-features"]:
        assert lid in ids
    meta = {m["slug"]: m for m in style["metadata"]["jigmap:layers"]}
    assert meta["bathymetry-depth"]["data_kind"] == "historical_compilation"
    assert meta["bathymetry-features"]["data_kind"] == "derived_analysis"
    assert meta["bathymetry-depth"]["default_opacity"] == 0.55
    assert style["sources"]["bathymetry-contours"]["tiles"][0].endswith(
        "/api/v1/bathymetry/contours/{z}/{x}/{y}.pbf"
    )
    cfg = (await client.get("/api/v1/map/config")).json()
    assert {m["slug"] for m in cfg["layers"]} == set(meta)


async def test_offline_package_download_requires_sign_in_and_is_intact(client, ingested_dataset):
    pkgs = (await client.get("/api/v1/offline/packages")).json()
    assert len(pkgs) == 1
    pkg = pkgs[0]
    assert pkg["name"] == "Malé test region"
    assert (await client.get(pkg["download_url"])).status_code == 401

    token = await _token(client)
    r = await client.get(pkg["download_url"], headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert hashlib.sha256(r.content).hexdigest() == pkg["sha256"] == r.headers["x-content-sha256"]
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    manifest = json.loads(zf.read("manifest.json"))
    assert manifest["format_version"] == 1
    assert manifest["dataset"]["data_kind"] == "historical_compilation"
    assert "NOT a nautical chart" in manifest["disclaimer"]
    for name, info in manifest["files"].items():
        assert hashlib.sha256(zf.read(name)).hexdigest() == info["sha256"]
    grid = np.frombuffer(zf.read("elevation.i16"), dtype="<i2").reshape(120, 120)
    fx = np.load("tests/fixtures/gebco2026_male_excerpt.npz")
    assert np.array_equal(grid, fx["elevation"])

    mine = (
        await client.get("/api/v1/offline/downloads", headers={"Authorization": f"Bearer {token}"})
    ).json()
    assert mine[0]["sha256"] == pkg["sha256"]


async def test_admin_ingestion_endpoints_require_admin(client, ingested_dataset):
    captain = await _token(client)
    h = {"Authorization": f"Bearer {captain}"}
    assert (await client.get("/api/v1/admin/ingestion/jobs", headers=h)).status_code == 403
    assert (await client.post("/api/v1/admin/ingestion/gebco", headers=h)).status_code == 403

    admin = await _token(client, role="admin")
    h = {"Authorization": f"Bearer {admin}"}
    jobs = (await client.get("/api/v1/admin/ingestion/jobs", headers=h)).json()
    done = next(j for j in jobs if j["id"] == str(ingested_dataset["job_id"]))
    assert done["status"] == "succeeded"
    assert any("activated dataset" in e["msg"] for e in done["log"])

    queued = await client.post("/api/v1/admin/ingestion/gebco", headers=h)
    assert queued.status_code == 202
    assert (await client.post("/api/v1/admin/ingestion/gebco", headers=h)).status_code == 409
    # No worker runs in tests: mark it failed so later runs are not blocked.
    from app.db.session import get_sessionmaker

    async with get_sessionmaker()() as s:
        await s.execute(
            text("UPDATE data_ingestion_jobs SET status='failed', error='test cleanup' WHERE id=:i"),
            {"i": queued.json()["job_id"]},
        )
        await s.commit()


async def test_readiness_includes_object_storage(client):
    body = (await client.get("/api/v1/health/ready")).json()
    assert body["checks"]["object_storage"]["status"] == "ok"

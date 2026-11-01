"""Ocean observations and fishing predictions on real NOAA data around Malé (cropped ERDDAP output).

Fixtures: MUR SST v4.1 (2026-10-29) and VIIRS DINEOF chlorophyll (2026-10-28), cropped from the
real ERDDAP NetCDF responses. The ingestion job runs with these instead of the live download.
"""

import numpy as np
import pytest

from app.ingestion import fishing, ocean

FIX = {"sst": "tests/fixtures/mur_sst_male.nc", "chl": "tests/fixtures/viirs_chl_male.nc"}


def _fetch(p):
    with open(FIX[p.variable], "rb") as fh:
        return fh.read()


def test_parse_and_validate_real_sst_and_chl():
    sst = ocean.parse_erddap_nc(_fetch(ocean.PRODUCTS[0]), ocean.PRODUCTS[0], "fixture")
    assert sst.res == pytest.approx(0.01, abs=1e-6)
    assert sst.time.date().isoformat() == "2026-10-29"
    assert sst.north > sst.north - sst.res * sst.data.shape[0]  # north-up
    stats = ocean.validate(sst)
    assert 28 < stats["min"] <= stats["max"] < 32
    chl = ocean.parse_erddap_nc(_fetch(ocean.PRODUCTS[1]), ocean.PRODUCTS[1], "fixture")
    assert chl.time.date().isoformat() == "2026-10-28"
    assert ocean.validate(chl)["min"] > 0


def test_validation_rejects_impossible_values():
    g = ocean.parse_erddap_nc(_fetch(ocean.PRODUCTS[0]), ocean.PRODUCTS[0], "fixture")
    g.data[0, 0] = 55.0
    with pytest.raises(ValueError, match="outside"):
        ocean.validate(g)


def test_factor_functions():
    assert fishing.sst_score(np.array([19.0, 26.0, 31.5]))[1] == 1.0
    assert fishing.sst_score(np.array([19.0]))[0] == 0.0
    assert fishing.chl_score(np.array([0.2]))[0] == pytest.approx(1.0)
    assert fishing.chl_score(np.array([2.0]))[0] < 0.1
    assert fishing.structure_score(np.array([0.0]))[0] == 1.0
    score, used = fishing.combine(
        {
            "sst": np.array([1.0]),
            "front": np.array([0.0]),
            "chl": np.array([np.nan]),
            "structure": np.array([1.0]),
        }
    )
    # chlorophyll missing: weights renormalised over the other three factors
    assert used[0] == pytest.approx(0.75)
    assert score[0] == pytest.approx(100 * (0.2 + 0.25) / 0.75)


@pytest.fixture(scope="module")
def ocean_ingested(ingested_dataset):
    from app.ingestion.gebco import sync_session_factory

    with sync_session_factory()() as s:
        job = ocean.create_job(s)
    ocean.run(job.id, fetch=_fetch)
    with sync_session_factory()() as s:
        fishing.build(s)
    return True


async def test_latest_reports_kinds_times_and_not_connected(client, ocean_ingested):
    body = (await client.get("/api/v1/ocean/latest")).json()
    obs, pred = body["observations"], body["predictions"]
    assert obs["sst"]["observed_at"].startswith("2026-10-29") and obs["sst"]["data_kind"] == "observation"
    assert obs["chl"]["observed_at"].startswith("2026-10-28")
    assert obs["sst_front"]["data_kind"] == "derived_analysis"
    assert pred["tuna_habitat"]["data_kind"] == "prediction"
    assert pred["tuna_habitat"]["validation"]["status"] == "not_validated"
    assert pred["jigging_zones"]["data_kind"] == "derived_analysis"
    assert "not selected" in body["not_connected"]["wind_waves"]


async def test_point_explains_the_tuna_score(client, ocean_ingested):
    # Deep water east of Malé atoll, inside the fixture area.
    r = (await client.get("/api/v1/ocean/point", params={"lat": 4.2, "lon": 73.7})).json()
    t = r["tuna_habitat"]
    assert t["data_kind"] == "prediction" and "not a fish location" in t["statement"]
    assert set(t["factors"]) == {"sst", "front", "chl", "structure"}
    assert abs(sum(f["weight"] for f in t["factors"].values()) - 1.0) < 1e-9
    assert 28 < r["observations"]["sst"]["value"] < 32
    if not t["excluded"]:
        assert 0 <= t["score"] <= 100
        # The shown score must equal the weighted mean of the shown factor scores (renormalised
        # over the factors actually used), so the explanation can never disagree with the number.
        used = {k: f for k, f in t["factors"].items() if f["score"] is not None}
        expect = (
            100
            * sum(f["weight"] * f["score"] for f in used.values())
            / sum(f["weight"] for f in used.values())
        )
        assert abs(t["score"] - expect) <= 0.5
    lagoon = (await client.get("/api/v1/ocean/point", params={"lat": 4.30, "lon": 73.42})).json()
    assert lagoon["tuna_habitat"]["excluded"] in (True, False)


async def test_ocean_tiles_and_style(client, ocean_ingested):
    from app.ingestion.raster_tiles import lat_to_tile_y, lon_to_tile_x

    x, y = lon_to_tile_x(73.5, 8), lat_to_tile_y(4.2, 8)
    r = await client.get(f"/api/v1/ocean/tiles/sst/8/{x}/{y}.png")
    assert r.status_code == 200 and r.content[:4] == b"\x89PNG"
    assert (await client.get("/api/v1/ocean/tiles/sst/8/0/0.png")).status_code == 204
    assert (await client.get(f"/api/v1/ocean/tiles/wind/8/{x}/{y}.png")).status_code == 422
    style = (await client.get("/api/v1/map/style.json")).json()
    ids = [layer["id"] for layer in style["layers"]]
    for lid in ("tuna_habitat", "jigging_zones", "sst", "chl", "sst_front"):
        assert lid in ids
    assert ids.index("tuna_habitat") < ids.index("bathymetry-contours")  # contours stay on top
    meta = {m["slug"]: m for m in style["metadata"]["jigmap:layers"]}
    assert meta["tuna_habitat"]["mode"] == "fishing" and meta["sst"]["mode"] == "weather"


def _grid(score, used=None, shore=None):
    g = {"score": np.asarray(score, np.float32), "west": 73.0, "north": 5.0, "res": 0.01}
    g["weight_used"] = np.ones_like(g["score"]) if used is None else np.asarray(used, np.float32)
    if shore is not None:
        g["shore_km"] = np.asarray(shore, np.float32)
    return g


def test_hotspots_pick_separated_peaks_in_rank_order():
    from app.ingestion.fishing import hotspots

    s = np.full((100, 100), 50, np.float32)
    s[20:23, 20:23] = 90  # strong peak
    s[25:28, 25:28] = 89  # too close to the first (~7 km) -> not a separate spot
    s[70:73, 70:73] = 85  # far away -> second spot
    h = hotspots(_grid(s))
    assert [sp["rank"] for sp in h["spots"]] == [1, 2]
    a, b = h["spots"]
    assert a["score"] == 90 and (a["lat"], a["lon"]) == (4.785, 73.215)
    assert b["score"] == 85 and (b["lat"], b["lon"]) == (4.285, 73.715)
    assert h["mask"].sum() > 0 and not h["mask"][50, 50]


def test_hotspots_single_pixel_spike_does_not_win():
    from app.ingestion.fishing import hotspots

    s = np.full((60, 60), 50, np.float32)
    s[10, 10] = 100  # lone pixel: 3x3 mean is only ~55.6
    s[40:43, 40:43] = 80
    h = hotspots(_grid(s))
    assert h["spots"][0]["lat"] == 4.585 and h["spots"][0]["score"] == 80


def test_hotspots_rules_floor_weight_and_reach():
    from app.ingestion.fishing import hotspots

    flat = np.full((40, 40), 55, np.float32)  # a poor day: nothing reaches 60
    assert hotspots(_grid(flat))["spots"] == []
    s = np.full((40, 40), 50, np.float32)
    s[5:8, 5:8] = 90
    used = np.ones_like(s)
    used[5:8, 5:8] = 0.5  # score rests on too little evidence
    assert hotspots(_grid(s, used))["spots"] == []
    shore = np.full_like(s, 150)  # too far from Maldivian reefs
    assert hotspots(_grid(s, shore=shore))["spots"] == []
    shore[:] = 20
    assert len(hotspots(_grid(s, shore=shore))["spots"]) == 1

"""Official FAD lists (Ministry of Fisheries, Oct 2026): parsing must be exact or explicit."""

import hashlib
from datetime import date

import httpx
import pytest

from app.ingestion import fads

POLE = open("tests/fixtures/fads_pole_and_line_2026-10-07.pdf", "rb").read()
SPORT = open("tests/fixtures/fads_sport_2026-10-06.pdf", "rb").read()


@pytest.mark.parametrize(
    ("raw", "expected", "noted"),
    [
        ("73 29.700 E", 73 + 29.7 / 60, False),
        ("72 42 35 E", 72 + (42 + 35 / 60) / 60, False),
        ("72 49 60 E", 72 + 50 / 60, True),  # 60 seconds
        ("73 38 800 E", 73 + 38.8 / 60, True),  # decimal point missing
        ("72 35 .300 E", 72 + 35.3 / 60, True),  # stray space
        ("00 12. 000 N", 12 / 60, True),
        ("03 33200 N", 3 + 33.2 / 60, True),
        ("01 45.300N", 1 + 45.3 / 60, False),
        ("00 41.100 S", -(41.1 / 60), False),
    ],
)
def test_parse_coord(raw, expected, noted):
    hemi = ("E", "W") if raw.rstrip().endswith(("E", "W")) else ("N", "S")
    value, notes = fads.parse_coord(raw, *hemi)
    assert value == pytest.approx(expected, abs=1e-9)
    assert bool(notes) == noted


@pytest.mark.parametrize("raw", ["72 61 10 E", "73 99.000 E", "73 29.700", "abc E"])
def test_parse_coord_rejects_unreadable(raw):
    with pytest.raises((fads.CoordError, ValueError)):
        fads.parse_coord(raw, "E", "W")


def test_pole_and_line_list_is_read_completely():
    rows = fads.parse_list(POLE, "pole_and_line")
    assert sorted(r.row_no for r in rows) == list(range(1, 67))
    assert sum(r.status == "in_place" for r in rows) == 58
    assert sum(r.status == "broken_away" for r in rows) == 8
    assert not [r for r in rows if r.excluded_reason]
    first = next(r for r in rows if r.row_no == 1)
    assert first.code == "B08D01-01" and first.status == "broken_away"  # blue row in the list
    assert first.deployed_on == date(2023, 7, 24)
    assert (first.raw_lat, first.raw_lon) == ("07 18 19 N", "72 42 35 E")
    assert first.lat == pytest.approx(7 + 18 / 60 + 19 / 3600)
    dupes = [r for r in rows if r.code == "H10D01"]
    assert [r.row_no for r in dupes] == [23, 25]
    assert all("appears 2 times" in r.notes[-1] for r in dupes)
    r31 = next(r for r in rows if r.row_no == 31)
    assert r31.code == "K10D01-01" and "K10D01.01" in r31.notes[0]


def test_sport_list_is_read_completely():
    rows = fads.parse_list(SPORT, "sport")
    assert sorted(r.row_no for r in rows) == list(range(1, 60))
    assert (sum(r.status == "in_place" for r in rows), sum(r.status == "broken_away" for r in rows)) == (
        40,
        19,
    )
    r34 = next(r for r in rows if r.row_no == 34)
    assert "No FAD code printed" in r34.notes[0]
    assert r34.lat == pytest.approx(2 + 57.1 / 60)


def test_page_with_unlabelled_lists_is_refused():
    html = '<a href="https://fisheries.gov.mv/images/a.pdf">a</a>'

    def handler(req: httpx.Request) -> httpx.Response:
        return (
            httpx.Response(200, text=html) if req.url.path == "/fad" else httpx.Response(200, content=b"%PDF")
        )

    with (
        httpx.Client(transport=httpx.MockTransport(handler)) as c,
        pytest.raises(RuntimeError, match="expected one"),
    ):
        fads.fetch_sources(c)


async def test_fads_api(client, ingested_dataset):
    srcs = [
        fads.FadSource(
            "pole_and_line",
            "Tuna and Pole and Line ( FADs ) positions list (7th October 2026)",
            "https://fisheries.gov.mv/images/fixture-pole.pdf",
            hashlib.sha256(POLE).hexdigest(),
            POLE,
        ),
        fads.FadSource(
            "sport",
            "Sport ( FADs ) positions list (6th October 2026)",
            "https://fisheries.gov.mv/images/fixture-sport.pdf",
            hashlib.sha256(SPORT).hexdigest(),
            SPORT,
        ),
    ]
    summary = fads.run(sources=srcs)
    assert summary["pole_and_line"]["stored"] == 66 and summary["sport"]["stored"] == 59
    body = (await client.get("/api/v1/fads")).json()
    assert len(body["features"]) == 125
    assert {lst["list_type"] for lst in body["lists"]} == {"pole_and_line", "sport"}
    assert "broken away" in body["notice"] or "broken_away" in body["notice"]
    f = next(x for x in body["features"] if x["properties"]["code"] == "B08D01-01")
    assert f["properties"]["status"] == "broken_away" and f["properties"]["published_lat"] == "07 18 19 N"

"""Range-request ZIP streaming with CRC verification, against an in-memory HTTP server."""

import io
import os
import zipfile

import httpx
import pytest

from app.ingestion.remote_zip import ChecksumMismatch, open_archive, stream_member


def _server(blob: bytes) -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        headers = {"accept-ranges": "bytes", "last-modified": "Wed, 22 Apr 2026 14:17:49 GMT"}
        if request.method == "HEAD":
            return httpx.Response(200, headers={**headers, "content-length": str(len(blob))})
        rng = request.headers.get("range")
        if not rng:
            return httpx.Response(200, content=blob, headers=headers)
        start, end = (int(v) for v in rng.removeprefix("bytes=").split("-"))
        return httpx.Response(206, content=blob[start : end + 1], headers=headers)

    return httpx.Client(transport=httpx.MockTransport(handler))


def _zip(members: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, data in members.items():
            zf.writestr(name, data)
    return buf.getvalue()


def test_streams_only_the_requested_member(tmp_path):
    payload = os.urandom(300_000) + b"x" * 700_000
    blob = _zip({"a.tif": b"other", "gebco_n0.0_s-90.0_w0.0_e90.0.tif": payload})
    client = _server(blob)
    archive = open_archive(client, "https://example.test/g.zip")
    assert set(archive.members) == {"a.tif", "gebco_n0.0_s-90.0_w0.0_e90.0.tif"}
    assert archive.last_modified.year == 2026
    dest = tmp_path / "out.tif"
    stream_member(client, archive, "gebco_n0.0_s-90.0_w0.0_e90.0.tif", str(dest))
    assert dest.read_bytes() == payload


def test_corrupted_member_is_rejected(tmp_path):
    blob = bytearray(_zip({"m.tif": b"y" * 200_000}))
    client = _server(bytes(blob))
    archive = open_archive(client, "https://example.test/g.zip")
    info = archive.members["m.tif"]
    # Flip a byte inside the stored member data.
    data_start = info.header_offset + 30 + len("m.tif")
    blob[data_start + 5] ^= 0xFF
    bad = _server(bytes(blob))
    with pytest.raises((ChecksumMismatch, Exception)):
        stream_member(bad, archive, "m.tif", str(tmp_path / "m.tif"))


def test_member_selection_by_bounds():
    from app.ingestion.gebco import members_for_bounds

    names = [
        "gebco_2026_n0.0_s-90.0_w0.0_e90.0_geotiff.tif",
        "gebco_2026_n90.0_s0.0_w0.0_e90.0_geotiff.tif",
        "gebco_2026_n90.0_s0.0_w90.0_e180.0_geotiff.tif",
        "GEBCO_Grid_documentation.pdf",
    ]
    picked = members_for_bounds(names, {"west": 70, "south": -3.5, "east": 77.5, "north": 8.5})
    assert picked == names[:2]

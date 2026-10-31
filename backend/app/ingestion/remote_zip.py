"""Read members of a large remote ZIP archive using HTTP range requests.

The GEBCO grids are published as multi-GB ZIP archives. We only need a couple of
members, so we read the central directory with range requests and then stream
just those members, verifying each one's CRC-32 and size against the archive's
central directory before it is used.
"""

import io
import zipfile
import zlib
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from email.utils import parsedate_to_datetime

import httpx

_LOCAL_HEADER_SIZE = 30


class ChecksumMismatch(Exception):
    pass


class _RangeReader(io.RawIOBase):
    """Seekable file-like object over HTTP range requests, with a small read-ahead block cache."""

    BLOCK = 256 * 1024

    def __init__(self, client: httpx.Client, url: str, size: int):
        self._client, self._url, self._size, self._pos = client, url, size, 0
        self._cache: dict[int, bytes] = {}

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self._pos

    def seek(self, offset: int, whence: int = 0) -> int:
        self._pos = offset if whence == 0 else self._pos + offset if whence == 1 else self._size + offset
        return self._pos

    def _block(self, index: int) -> bytes:
        if index not in self._cache:
            start = index * self.BLOCK
            end = min(start + self.BLOCK, self._size) - 1
            resp = self._client.get(self._url, headers={"Range": f"bytes={start}-{end}"})
            resp.raise_for_status()
            if resp.status_code != 206:
                raise OSError("Server ignored the Range header; refusing to download the whole archive")
            self._cache[index] = resp.content
        return self._cache[index]

    def readinto(self, buf) -> int:
        if self._pos >= self._size:
            return 0
        n = min(len(buf), self._size - self._pos)
        out = bytearray()
        while len(out) < n:
            block, off = divmod(self._pos + len(out), self.BLOCK)
            out += self._block(block)[off : off + (n - len(out))]
        buf[:n] = out
        self._pos += n
        return n


@dataclass
class RemoteArchive:
    url: str
    size: int
    last_modified: datetime | None
    members: dict[str, zipfile.ZipInfo]


def open_archive(client: httpx.Client, url: str) -> RemoteArchive:
    head = client.head(url)
    head.raise_for_status()
    if head.headers.get("accept-ranges") != "bytes":
        raise OSError(f"{url} does not support byte ranges")
    size = int(head.headers["content-length"])
    lm = head.headers.get("last-modified")
    zf = zipfile.ZipFile(io.BufferedReader(_RangeReader(client, url, size), buffer_size=_RangeReader.BLOCK))
    return RemoteArchive(
        url=url,
        size=size,
        last_modified=parsedate_to_datetime(lm) if lm else None,
        members={i.filename: i for i in zf.infolist()},
    )


def stream_member(
    client: httpx.Client,
    archive: RemoteArchive,
    name: str,
    dest_path: str,
    progress: Callable[[int, int], None] | None = None,
) -> int:
    """Download and decompress one member to `dest_path`; returns its verified CRC-32."""
    info = archive.members[name]
    if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
        raise OSError(f"Unsupported compression method {info.compress_type} for {name}")

    hdr = client.get(
        archive.url,
        headers={"Range": f"bytes={info.header_offset}-{info.header_offset + _LOCAL_HEADER_SIZE - 1}"},
    ).content
    if hdr[:4] != b"PK\x03\x04":
        raise OSError(f"Bad local header for {name}")
    name_len = int.from_bytes(hdr[26:28], "little")
    extra_len = int.from_bytes(hdr[28:30], "little")
    start = info.header_offset + _LOCAL_HEADER_SIZE + name_len + extra_len
    end = start + info.compress_size - 1

    decomp = zlib.decompressobj(-15) if info.compress_type == zipfile.ZIP_DEFLATED else None
    crc = 0
    written = 0
    with (
        client.stream("GET", archive.url, headers={"Range": f"bytes={start}-{end}"}) as resp,
        open(dest_path, "wb") as out,
    ):
        resp.raise_for_status()
        if resp.status_code != 206:
            raise OSError("Server ignored the Range header")
        received = 0
        for chunk in resp.iter_bytes(1024 * 1024):
            received += len(chunk)
            data = decomp.decompress(chunk) if decomp else chunk
            crc = zlib.crc32(data, crc)
            written += len(data)
            out.write(data)
            if progress:
                progress(received, info.compress_size)
        if decomp:
            tail = decomp.flush()
            crc = zlib.crc32(tail, crc)
            written += len(tail)
            out.write(tail)

    if written != info.file_size or crc != info.CRC:
        raise ChecksumMismatch(
            f"{name}: expected {info.file_size} bytes crc={info.CRC:08x}, got {written} bytes crc={crc:08x}"
        )
    return crc

"""Official FAD (fish aggregating device) positions from the Maldives Ministry of Fisheries.

Source: https://fisheries.gov.mv/fad publishes two PDF lists ("Tuna and Pole and Line" and
"Sport"). Each row has: number, atoll, FAD code, name, distance/direction from an island,
latitude, longitude (degrees + minutes, sometimes deg-min-sec) and deployment date. Row colour
is the status, per the legend on the list:
  yellow = FAD has NOT broken away (in place); blue = FAD has broken away.

Rules (accuracy first):
  * Coordinates are parsed exactly as published. Where the list has an obvious typing slip
    (missing decimal point, 60 seconds, stray space) the reading is recorded in `parse_note`
    with the original text; anything that cannot be read safely is excluded, never guessed.
  * Every position must fall inside the Maldives box; positions are not moved or rounded.
  * The Dhivehi columns (names, island distances) are not machine-readable in these PDFs
    (no Unicode mapping), so they are not reproduced; users are linked to the official PDF.
"""

import hashlib
import io
import re
from dataclasses import dataclass, field
from datetime import date

import httpx
import pdfplumber

FAD_PAGE = "https://fisheries.gov.mv/fad"
BLUE = (0.741, 0.843, 0.933)
YELLOW = (1, 0.949, 0.8)
CODE_RE = re.compile(r"^(?:[A-Z]\d{2}[A-Z]\d{2}(?:-\d{2})?|\d{3})$")
DATE_RE = re.compile(r"^(\d{2})/(\d{2})/(\d{4})$")


@dataclass
class FadRow:
    list_type: str  # pole_and_line | sport
    row_no: int
    code: str
    status: str  # in_place | broken_away | unknown
    lat: float | None
    lon: float | None
    deployed_on: date | None
    raw_lat: str
    raw_lon: str
    listed_distance_nm: float | None = None  # "distance from island" column, as printed
    notes: list[str] = field(default_factory=list)
    excluded_reason: str | None = None
    grid_depth_m: float | None = None
    nearest_shallow_nm: float | None = None


class CoordError(ValueError):
    pass


def parse_coord(raw: str, positive: str, negative: str) -> tuple[float, list[str]]:
    """Parse '73 29.700 E', '72 42 35 E', '01 45.300N', with explicit notes for any correction."""
    notes: list[str] = []
    s = raw.strip().upper()
    m = re.match(rf"^(.*?)\s*([{positive}{negative}])$", s)
    if not m:
        raise CoordError(f"no hemisphere letter in {raw!r}")
    body, hemi = m.group(1).strip(), m.group(2)
    parts = body.split()
    # Repair split decimal tokens such as "35 .300" or "12. 000".
    joined: list[str] = []
    for p in parts:
        if p.startswith(".") and joined:
            joined[-1] = joined[-1] + p
            notes.append(f"read '{raw}' with the stray space removed")
        elif joined and joined[-1].endswith("."):
            joined[-1] = joined[-1] + p
            notes.append(f"read '{raw}' with the stray space removed")
        else:
            joined.append(p)
    parts = joined
    if len(parts) == 2 and "." not in parts[1] and len(parts[1]) == 5:  # "33200": decimal point missing
        deg, minutes = int(parts[0]), float(parts[1][:2] + "." + parts[1][2:])
        notes.append(f"'{raw}' read as {deg}°{minutes:.3f}' (decimal point missing in the list)")
    elif len(parts) == 2:  # degrees + decimal minutes
        deg, minutes = int(parts[0]), float(parts[1])
    elif len(parts) == 3 and "." not in parts[2]:
        d, a, b = parts
        if len(b) == 3:  # "38 800": decimal point missing from the minutes (seconds never have 3 digits)
            minutes = float(f"{a}.{b}")
            notes.append(f"'{raw}' read as {int(d)}°{minutes:.3f}' (decimal point missing in the list)")
        elif len(b) <= 2:  # degrees minutes seconds
            sec = int(b)
            if sec > 60:
                raise CoordError(f"seconds out of range in {raw!r}")
            if sec == 60:
                notes.append(f"'{raw}' has 60 seconds; read as {int(a) + 1:02d}'00\"")
            minutes = int(a) + sec / 60.0
        else:
            raise CoordError(f"cannot read {raw!r}")
        deg = int(d)
    else:
        raise CoordError(f"cannot read {raw!r}")
    if not 0 <= minutes < 61:
        raise CoordError(f"minutes out of range in {raw!r}")
    value = deg + minutes / 60.0
    return (-value if hemi == negative else value), notes


def _close(a, b, tol=0.02) -> bool:
    return a is not None and len(a) == len(b) and all(abs(x - y) <= tol for x, y in zip(a, b, strict=True))


def _ascii(text: str | None) -> str:
    return " ".join("".join(ch for ch in (text or "") if ord(ch) < 128).split())


def parse_list(pdf_bytes: bytes, list_type: str) -> list[FadRow]:
    """Read the table cells of each page: [date, lon, lat, distance, name, code, atoll, #]."""
    rows: list[FadRow] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            fills = [
                r for r in page.rects if r["width"] > 40 and r.get("non_stroking_color") not in (None, (0,))
            ]
            for table in page.find_tables():
                for trow in table.rows:
                    cells = [_ascii(page.crop(c).extract_text()) if c else "" for c in trow.cells]
                    if len(cells) < 8 or not cells[-1].isdigit() or not DATE_RE.match(cells[0]):
                        continue
                    code = cells[5].replace(" ", "")
                    code_note = None
                    if re.match(r"^[A-Z]\d{2}[A-Z]\d{2}\.\d{2}$", code):
                        code_note = f"FAD code printed as '{code}' in the list"
                        code = code.replace(".", "-")
                    elif code == "":
                        code_note = "No FAD code printed in the list for this row"
                        code = f"(row {cells[-1]}, no code)"
                    elif not CODE_RE.match(code):
                        continue
                    y_mid = (trow.bbox[1] + trow.bbox[3]) / 2
                    fill = next(
                        (r["non_stroking_color"] for r in fills if r["top"] - 1 <= y_mid <= r["bottom"] + 1),
                        None,
                    )
                    status = (
                        "broken_away"
                        if _close(fill, BLUE)
                        else "in_place"
                        if _close(fill, YELLOW)
                        else "unknown"
                    )
                    d, mth, y = DATE_RE.match(cells[0]).groups()
                    row = FadRow(
                        list_type,
                        int(cells[-1]),
                        code,
                        status,
                        None,
                        None,
                        date(int(y), int(mth), int(d)),
                        cells[2],
                        cells[1],
                    )
                    try:
                        row.listed_distance_nm = float(cells[3].replace(" ", ""))
                    except ValueError:
                        pass
                    if code_note:
                        row.notes.append(code_note)
                    try:
                        row.lat, n1 = parse_coord(cells[2], "N", "S")
                        row.lon, n2 = parse_coord(cells[1], "E", "W")
                        row.notes += n1 + n2
                    except (CoordError, ValueError) as exc:
                        row.excluded_reason = f"coordinates not readable: {exc}"
                    if row.lat is not None and not (-3.5 <= row.lat <= 8.5 and 70.0 <= row.lon <= 77.5):
                        row.excluded_reason = "position outside the Maldives"
                    if status == "unknown":
                        row.notes.append("row colour (status) not recognised")
                    rows.append(row)
    # Flag codes that appear more than once in the same list (do not pick one: show both, with a note).
    by_code: dict[str, list[FadRow]] = {}
    for r in rows:
        by_code.setdefault(r.code, []).append(r)
    for code, dupes in by_code.items():
        if len(dupes) > 1:
            nums = ", ".join(str(d.row_no) for d in dupes)
            for d in dupes:
                d.notes.append(f"Code {code} appears {len(dupes)} times in this official list (rows {nums})")
    return rows


@dataclass
class FadSource:
    list_type: str
    title: str
    url: str
    sha256: str
    pdf: bytes


def fetch_sources(client: httpx.Client) -> list[FadSource]:
    """Find the current list PDFs on the official page and download them."""
    html = client.get(FAD_PAGE).text
    found = []
    seen = set()
    for title, href in re.findall(r'"[A-Za-z_]+":"([^"]*positions list[^"]*)","file":"([^"]+\.pdf)"', html):
        if href in seen:
            continue
        seen.add(href)
        lt = "sport" if title.strip().lower().startswith("sport") else "pole_and_line"
        url = href if href.startswith("http") else "https://fisheries.gov.mv/images/" + href
        pdf = client.get(url.replace(" ", "%20")).content
        found.append(FadSource(lt, " ".join(title.split()), url, hashlib.sha256(pdf).hexdigest(), pdf))
    types = sorted(f.list_type for f in found)
    if types != ["pole_and_line", "sport"]:
        # Never guess which PDF is which: a wrong label would mislabel every FAD.
        raise RuntimeError(f"expected one pole-and-line and one sport list on {FAD_PAGE}, found {types}")
    return found


def cross_check(rows: list[FadRow], grid) -> None:
    """Independent checks against GEBCO: FADs are anchored in deep water, and the listed
    distance from an island should be roughly consistent with the position."""
    from scipy import ndimage

    from app.ingestion.analysis import M_PER_DEG_LAT

    shallow = grid.elevation > -10  # islands, reef flats and lagoon shallows
    cell_nm = grid.res_deg * M_PER_DEG_LAT / 1852
    dist_cells = ndimage.distance_transform_edt(~shallow)
    for r in rows:
        if r.lat is None:
            continue
        cell = grid.cell_of(r.lat, r.lon)
        if cell is None:
            continue
        rr, cc = cell
        elev = float(grid.elevation[rr, cc])
        r.grid_depth_m = round(-elev, 0)
        r.nearest_shallow_nm = round(float(dist_cells[rr, cc]) * cell_nm, 1)
        if elev > -100:
            r.notes.append(
                f"Check: the depth map shows only ~{max(0, -elev):.0f} m here "
                "(FADs are usually in deep water)"
            )
        if r.listed_distance_nm is not None and r.nearest_shallow_nm > r.listed_distance_nm + 5:
            r.notes.append(
                f"Check: position is {r.nearest_shallow_nm} NM from the nearest reef/island, "
                f"but the list says {r.listed_distance_nm} NM from its island"
            )


def store(session, sources_rows: list[tuple["FadSource", list[FadRow]]]) -> dict:
    """Replace the latest list per type with the newly parsed rows (excluded rows are not stored)."""
    from geoalchemy2.elements import WKTElement
    from sqlalchemy import update

    from app.models import FadList, FadPosition

    summary = {}
    for src, rows in sources_rows:
        kept = [r for r in rows if r.excluded_reason is None and r.lat is not None]
        session.execute(
            update(FadList)
            .where(FadList.list_type == src.list_type, FadList.is_latest)
            .values(is_latest=False)
        )
        lst = FadList(
            list_type=src.list_type,
            title=src.title,
            source_url=src.url,
            sha256=src.sha256,
            row_count=len(kept),
            is_latest=True,
        )
        session.add(lst)
        session.flush()
        for r in kept:
            session.add(
                FadPosition(
                    list_id=lst.id,
                    row_no=r.row_no,
                    code=r.code,
                    status=r.status,
                    geom=WKTElement(f"POINT({r.lon} {r.lat})", srid=4326),
                    lat=r.lat,
                    lon=r.lon,
                    raw_lat=r.raw_lat,
                    raw_lon=r.raw_lon,
                    deployed_on=r.deployed_on,
                    listed_distance_nm=r.listed_distance_nm,
                    grid_depth_m=r.grid_depth_m,
                    notes=r.notes,
                )
            )
        summary[src.list_type] = {
            "rows": len(rows),
            "stored": len(kept),
            "excluded": [(r.row_no, r.excluded_reason) for r in rows if r.excluded_reason],
            "in_place": sum(r.status == "in_place" for r in kept),
            "broken_away": sum(r.status == "broken_away" for r in kept),
        }
    session.commit()
    return summary


def run(sources: list["FadSource"] | None = None) -> dict:
    from datetime import UTC, datetime

    from sqlalchemy import select

    from app.ingestion.gebco import sync_session_factory
    from app.models import BathymetryDataset, DataProvider, ProviderStatus
    from app.services.bathymetry import _load_grid_sync

    with sync_session_factory()() as session:
        provider = session.scalar(select(DataProvider).where(DataProvider.slug == "mv_fisheries_fads"))
        try:
            if sources is None:
                with httpx.Client(timeout=60, follow_redirects=True) as c:
                    sources = fetch_sources(c)
            if not sources:
                raise RuntimeError("no FAD lists found on the official page")
            ds = session.scalar(select(BathymetryDataset).where(BathymetryDataset.is_active))
            grid = _load_grid_sync(ds).grid if ds else None
            parsed = []
            for src in sources:
                rows = parse_list(src.pdf, src.list_type)
                if grid is not None:
                    cross_check(rows, grid)
                parsed.append((src, rows))
            summary = store(session, parsed)
            provider.status, provider.last_success_at, provider.last_error = (
                ProviderStatus.ok,
                datetime.now(UTC),
                None,
            )
            return summary
        except Exception as exc:
            session.rollback()
            provider.status, provider.last_error = ProviderStatus.failing, f"{type(exc).__name__}: {exc}"
            raise
        finally:
            provider.last_checked_at = datetime.now(UTC)
            session.commit()


if __name__ == "__main__":
    import json

    print(json.dumps(run(), indent=1, default=str))

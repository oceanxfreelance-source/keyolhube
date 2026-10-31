"""GEBCO bathymetry ingestion job.

Run from the worker (Celery task `bathymetry.ingest_gebco`) or directly:

    python -m app.ingestion.gebco            # creates a job row and runs it inline

Pipeline: official archive on CEDA -> stream required GeoTIFF members (CRC-32 verified)
-> exact 15" Maldives window -> validation -> GeoTIFFs in S3 -> slope / hillshade
-> contours + candidate features in PostGIS -> PNG tiles in S3 -> offline packages
-> atomic activation. Every step is logged on the job row.
"""

import os
import re
import shutil
import tempfile
import time
import traceback
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from datetime import UTC, datetime

import httpx
import numpy as np
import rasterio
from geoalchemy2.elements import WKTElement
from rasterio.transform import from_origin
from rasterio.windows import from_bounds as window_from_bounds
from sqlalchemy import create_engine, delete, insert, select, update
from sqlalchemy.orm import Session, sessionmaker

from app.core import storage
from app.core.config import get_settings
from app.ingestion import analysis, packages
from app.ingestion.analysis import Grid
from app.ingestion.raster_tiles import TileRenderer, tiles_for_bounds
from app.ingestion.remote_zip import open_archive, stream_member
from app.models import (
    BathymetryContour,
    BathymetryDataset,
    BathymetryFeature,
    DataKind,
    DataProvider,
    IngestionJob,
    JobStatus,
    MapLayer,
    OfflinePackage,
    ProviderStatus,
)
from app.services.basemap import MALDIVES_BOUNDS

RES_DEG = 1.0 / 240.0  # 15 arc-seconds
CITATION = "GEBCO Compilation Group (2026) GEBCO 2026 Grid (doi:10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa)"
CONTOUR_DEPTHS_M = [
    10,
    20,
    30,
    50,
    75,
    100,
    150,
    200,
    300,
    400,
    500,
    750,
    1000,
    1500,
    2000,
    2500,
    3000,
    4000,
    5000,
]
TILE_ZOOMS = range(4, 11)  # MapLibre over-zooms beyond 10 (~150 m/px, finer than the ~460 m grid)
KNOWN_TIDS = set(analysis.TID_LABELS)
_MEMBER_RE = re.compile(r"n(-?\d+(?:\.\d+)?)_s(-?\d+(?:\.\d+)?)_w(-?\d+(?:\.\d+)?)_e(-?\d+(?:\.\d+)?)")


class ValidationError(Exception):
    pass


# --- helpers -----------------------------------------------------------------------------


def sync_session_factory() -> sessionmaker[Session]:
    url = get_settings().database_url.replace("+asyncpg", "+psycopg")
    return sessionmaker(create_engine(url, pool_pre_ping=True), expire_on_commit=False)


def member_bounds(name: str) -> tuple[float, float, float, float] | None:
    """(west, south, east, north) parsed from a GEBCO tile name."""
    m = _MEMBER_RE.search(name)
    if not m or not name.endswith(".tif"):
        return None
    n, s, w, e = (float(v) for v in m.groups())
    return w, s, e, n


def members_for_bounds(names, bounds: dict) -> list[str]:
    out = []
    for name in names:
        b = member_bounds(name)
        if (
            b
            and b[0] < bounds["east"]
            and b[2] > bounds["west"]
            and b[1] < bounds["north"]
            and b[3] > bounds["south"]
        ):
            out.append(name)
    return sorted(out)


def read_window(paths: list[str], bounds: dict, dtype) -> np.ndarray:
    """Mosaic the exact 15" window covering `bounds` from GEBCO tiles. Unfilled cells raise."""
    width = round((bounds["east"] - bounds["west"]) / RES_DEG)
    height = round((bounds["north"] - bounds["south"]) / RES_DEG)
    out = np.zeros((height, width), dtype=dtype)
    filled = np.zeros((height, width), dtype=bool)
    for path in paths:
        with rasterio.open(path) as ds:
            if ds.crs is None or ds.crs.to_epsg() != 4326:
                raise ValidationError(f"{os.path.basename(path)}: unexpected CRS {ds.crs}")
            if abs(ds.res[0] - RES_DEG) > 1e-9 or abs(ds.res[1] - RES_DEG) > 1e-9:
                raise ValidationError(f"{os.path.basename(path)}: unexpected resolution {ds.res}")
            w = max(bounds["west"], ds.bounds.left)
            e = min(bounds["east"], ds.bounds.right)
            s = max(bounds["south"], ds.bounds.bottom)
            n = min(bounds["north"], ds.bounds.top)
            if w >= e or s >= n:
                continue
            win = window_from_bounds(w, s, e, n, ds.transform).round_offsets().round_lengths()
            data = ds.read(1, window=win)
            r0 = round((bounds["north"] - n) / RES_DEG)
            c0 = round((w - bounds["west"]) / RES_DEG)
            out[r0 : r0 + data.shape[0], c0 : c0 + data.shape[1]] = data
            filled[r0 : r0 + data.shape[0], c0 : c0 + data.shape[1]] = True
    if not filled.all():
        raise ValidationError(f"{int((~filled).sum())} cells of the requested window were not covered")
    return out


def validate(elev: np.ndarray, tid: np.ndarray) -> dict:
    if elev.shape != tid.shape:
        raise ValidationError(f"grid/TID shape mismatch {elev.shape} vs {tid.shape}")
    nodata = int(np.count_nonzero(~np.isfinite(elev.astype(np.float64))))
    lo, hi = float(np.nanmin(elev)), float(np.nanmax(elev))
    if lo < -11500 or hi > 9000:
        raise ValidationError(f"elevation outside physical range: {lo}..{hi}")
    codes, counts = np.unique(tid, return_counts=True)
    unknown = sorted(set(codes.tolist()) - KNOWN_TIDS)
    if unknown:
        raise ValidationError(f"unknown TID codes {unknown}")
    land_tid = tid == 0
    if np.any(elev[land_tid] < -50):
        raise ValidationError("cells flagged as land (TID 0) are far below sea level")
    tid_summary = {str(int(c)): int(n) for c, n in zip(codes, counts, strict=True)}
    total = elev.size
    direct = sum(n for c, n in tid_summary.items() if int(c) in analysis.DIRECT_MEASUREMENT_TIDS)
    ocean = int(np.count_nonzero(elev < 0))
    return {
        "min_elevation_m": lo,
        "max_elevation_m": hi,
        "nodata_cells": nodata,
        "ocean_cells": ocean,
        "land_cells": total - ocean,
        "tid_summary": tid_summary,
        "direct_measurement_share": round(direct / total, 4),
    }


def write_geotiff(path: str, array: np.ndarray, bounds: dict, nodata=None) -> None:
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        width=array.shape[1],
        height=array.shape[0],
        count=1,
        dtype=array.dtype,
        crs="EPSG:4326",
        transform=from_origin(bounds["west"], bounds["north"], RES_DEG, RES_DEG),
        compress="deflate",
        predictor=2,
        tiled=True,
        blockxsize=256,
        blockysize=256,
        nodata=nodata,
    ) as dst:
        dst.write(array, 1)


class JobLog:
    def __init__(self, session: Session, job: IngestionJob):
        self.session, self.job = session, job

    def __call__(self, msg: str, **stats) -> None:
        entry = {"at": datetime.now(UTC).isoformat(), "msg": msg}
        self.job.log = [*self.job.log, entry]
        if stats:
            self.job.stats = {**self.job.stats, **stats}
        self.session.commit()
        print(f"[gebco] {msg}", flush=True)


# --- the job -----------------------------------------------------------------------------


def create_job(session: Session, params: dict | None = None) -> IngestionJob:
    provider = session.scalar(select(DataProvider).where(DataProvider.slug == "gebco"))
    job = IngestionJob(
        provider_id=provider.id, job_type="gebco_bathymetry", params=params or {}, stats={}, log=[]
    )
    session.add(job)
    session.commit()
    return job


@dataclass
class SourceGrid:
    elevation: np.ndarray  # int16
    tid: np.ndarray  # uint8
    bounds: dict
    checksums: dict
    last_modified: datetime | None
    source_urls: dict


def run(
    job_id: uuid.UUID,
    keep_raw: bool = False,
    source: Callable[[JobLog, str], SourceGrid] | None = None,
    regions: list | None = None,
    tile_zooms: range = TILE_ZOOMS,
) -> None:
    """Run a job. `source` defaults to fetching the official GEBCO archives; tests pass a
    loader for a small real GEBCO excerpt instead."""
    settings = get_settings()
    Session_ = sync_session_factory()
    with Session_() as session:
        job = session.get(IngestionJob, job_id)
        provider = session.get(DataProvider, job.provider_id)
        job.status, job.started_at = JobStatus.running, datetime.now(UTC)
        session.commit()
        log = JobLog(session, job)
        workdir = tempfile.mkdtemp(prefix="gebco-", dir=_ensure_dir(settings.data_dir))
        try:
            src = (source or fetch_gebco)(log, workdir)
            process(
                session,
                job,
                provider,
                log,
                workdir,
                src,
                packages.REGIONS if regions is None else regions,
                tile_zooms,
            )
            job.status, job.finished_at = JobStatus.succeeded, datetime.now(UTC)
            provider.status, provider.last_success_at, provider.last_error = (
                ProviderStatus.ok,
                job.finished_at,
                None,
            )
        except Exception as exc:
            session.rollback()
            job = session.get(IngestionJob, job_id)
            provider = session.get(DataProvider, job.provider_id)
            job.status, job.finished_at = JobStatus.failed, datetime.now(UTC)
            job.error = f"{type(exc).__name__}: {exc}\n{traceback.format_exc(limit=5)}"
            has_active = session.scalar(select(BathymetryDataset.id).where(BathymetryDataset.is_active))
            provider.status = ProviderStatus.degraded if has_active else ProviderStatus.failing
            provider.last_error = f"{type(exc).__name__}: {exc}"
            raise
        finally:
            provider.last_checked_at = datetime.now(UTC)
            session.commit()
            if not keep_raw:
                shutil.rmtree(workdir, ignore_errors=True)


def _ensure_dir(path: str) -> str:
    os.makedirs(path, exist_ok=True)
    return path


def fetch_gebco(log: JobLog, workdir: str) -> SourceGrid:
    """Stream the GEBCO members covering the Maldives from CEDA and cut the exact window."""
    settings = get_settings()
    bounds = dict(MALDIVES_BOUNDS)

    # 1. Fetch official grid members ------------------------------------------------------
    paths: dict[str, list[str]] = {"grid": [], "tid": []}
    checksums: dict[str, str] = {}
    last_modified = None
    with httpx.Client(follow_redirects=True, timeout=httpx.Timeout(60, read=300)) as client:
        for kind, url in (("tid", settings.gebco_tid_zip_url), ("grid", settings.gebco_grid_zip_url)):
            archive = open_archive(client, url)
            last_modified = max(filter(None, [last_modified, archive.last_modified]), default=None)
            names = members_for_bounds(archive.members, bounds)
            if not names:
                raise ValidationError(f"no members of {url} cover the Maldives bounds")
            log(
                f"{kind}: archive {archive.size / 1e9:.2f} GB, using {len(names)} member(s): "
                + ", ".join(names)
            )
            for name in names:
                info = archive.members[name]
                dest = os.path.join(workdir, name)
                started = time.monotonic()
                crc = stream_member(client, archive, name, dest)
                checksums[name] = f"{crc:08x}"
                log(
                    f"{name}: {info.compress_size / 1e6:.0f} MB downloaded, CRC-32 {crc:08x} verified "
                    f"in {time.monotonic() - started:.0f}s"
                )
                paths[kind].append(dest)

    # 2. Window, validate ----------------------------------------------------------------------
    elev = read_window(paths["grid"], bounds, np.int16)
    tid = read_window(paths["tid"], bounds, np.uint8)
    for p in paths["grid"] + paths["tid"]:
        os.remove(p)  # ~0.9 GB each; no longer needed
    return SourceGrid(
        elev,
        tid,
        bounds,
        checksums,
        last_modified,
        {"grid": settings.gebco_grid_zip_url, "tid": settings.gebco_tid_zip_url},
    )


def process(
    session: Session,
    job: IngestionJob,
    provider: DataProvider,
    log: JobLog,
    workdir: str,
    src: SourceGrid,
    regions: list,
    tile_zooms: range,
) -> uuid.UUID:
    settings = get_settings()
    t0 = time.monotonic()
    storage.ensure_bucket()
    elev, tid, bounds = src.elevation, src.tid, src.bounds
    checksums, last_modified = src.checksums, src.last_modified
    stats = validate(elev, tid)
    log(f"validated {elev.shape[1]}x{elev.shape[0]} grid", **{"grid": stats})

    dataset_id = uuid.uuid4()
    prefix = f"bathymetry/{settings.gebco_version}/{dataset_id}"
    grid_path, tid_path = os.path.join(workdir, "elevation.tif"), os.path.join(workdir, "tid.tif")
    write_geotiff(grid_path, elev, bounds)
    write_geotiff(tid_path, tid, bounds)
    storage.put_file(f"{prefix}/elevation.tif", grid_path, "image/tiff")
    storage.put_file(f"{prefix}/tid.tif", tid_path, "image/tiff")
    log("stored GeoTIFFs in object storage")

    # 3. Derived products ----------------------------------------------------------------------
    grid = Grid(elev.astype(np.float32), bounds["west"], bounds["north"], RES_DEG)
    slope = analysis.slope_degrees(grid)
    shade = analysis.hillshade(grid)
    lines = analysis.contour_lines(grid, CONTOUR_DEPTHS_M)
    drop = analysis.drop_off_candidates(grid, slope, tid)
    rises = analysis.rise_candidates(grid, tid)
    feature_counts = {}
    for f in drop + rises:
        feature_counts[f.kind] = feature_counts.get(f.kind, 0) + 1
    log(
        f"derived {len(lines)} contour lines and {len(drop) + len(rises)} feature candidates",
        contours=len(lines),
        features=feature_counts,
    )

    res_m = RES_DEG * analysis.M_PER_DEG_LAT
    ds = BathymetryDataset(
        id=dataset_id,
        provider_id=provider.id,
        job_id=job.id,
        version=settings.gebco_version,
        citation=CITATION,
        source_urls=src.source_urls,
        source_last_modified=last_modified,
        source_checksums=checksums,
        bounds=WKTElement(_bbox_wkt(bounds), srid=4326),
        resolution_arcsec=15.0,
        resolution_m_approx=round(res_m, 1),
        width=grid.width,
        height=grid.height,
        min_elevation_m=stats["min_elevation_m"],
        max_elevation_m=stats["max_elevation_m"],
        nodata_cells=stats["nodata_cells"],
        tid_summary=stats["tid_summary"],
        grid_key=f"{prefix}/elevation.tif",
        tid_key=f"{prefix}/tid.tif",
        tiles_prefix=f"tiles/bathymetry/{dataset_id}",
        contour_levels_m=CONTOUR_DEPTHS_M,
        analysis_params={
            "drop_off": asdict(analysis.DropOffParams()),
            "rise": asdict(analysis.RiseParams()),
            "tile_zooms": [tile_zooms.start, tile_zooms.stop - 1],
        },
        is_active=False,
    )
    session.add(ds)
    session.flush()
    for i in range(0, len(lines), 5000):
        session.execute(
            insert(BathymetryContour),
            [
                {
                    "dataset_id": dataset_id,
                    "depth_m": ln.depth_m,
                    "geom": WKTElement(
                        "LINESTRING(" + ",".join(f"{x} {y}" for x, y in ln.coords) + ")", srid=4326
                    ),
                }
                for ln in lines[i : i + 5000]
            ],
        )
    if drop or rises:
        session.execute(
            insert(BathymetryFeature),
            [
                {
                    "dataset_id": dataset_id,
                    "kind": f.kind,
                    "geom": WKTElement(f"POINT({f.lon} {f.lat})", srid=4326),
                    "depth_m": f.depth_m,
                    "relief_m": f.relief_m,
                    "max_slope_deg": f.max_slope_deg,
                    "depth_range_m": list(f.depth_range_m) if f.depth_range_m else None,
                    "source_tid": f.source_tid,
                    "properties": f.properties,
                    "explanation": f.explanation,
                }
                for f in drop + rises
            ],
        )
    session.commit()
    log("stored contours and features in PostGIS")

    # 4. Tiles ---------------------------------------------------------------------------------
    renderer = TileRenderer(grid, slope, shade)
    jobs = [
        (z, x, y)
        for z in tile_zooms
        for x, y in tiles_for_bounds(bounds["west"], bounds["south"], bounds["east"], bounds["north"], z)
    ]
    uploaded = {"depth": 0, "slope": 0}

    def _one(zxy):
        z, x, y = zxy
        res = {}
        for layer, png in renderer.render(z, x, y).items():
            storage.put_bytes(f"{ds.tiles_prefix}/{layer}/{z}/{x}/{y}.png", png, "image/png")
            res[layer] = 1
        return res

    with ThreadPoolExecutor(max_workers=8) as pool:
        for r in pool.map(_one, jobs):
            for k in r:
                uploaded[k] += 1
    log(f"rendered and stored {uploaded['depth']} depth and {uploaded['slope']} slope tiles", tiles=uploaded)

    # 5. Offline packages ------------------------------------------------------------------------
    built = []
    for region in regions:
        pkg = packages.build_package(region, ds, grid, tid, lines, drop + rises, workdir)
        storage.put_file(pkg.s3_key, pkg.path, "application/zip")
        session.add(
            OfflinePackage(
                slug=f"bathymetry-{region.slug}-{str(dataset_id)[:8]}",
                name=region.name,
                kind="bathymetry",
                dataset_id=dataset_id,
                bounds=WKTElement(_bbox_wkt(region.bounds), srid=4326),
                s3_key=pkg.s3_key,
                size_bytes=pkg.size_bytes,
                sha256=pkg.sha256,
                contents=pkg.contents,
                data_updated_at=last_modified or datetime.now(UTC),
                is_active=False,
            )
        )
        built.append(f"{region.slug} {pkg.size_bytes / 1e6:.1f} MB")
    session.commit()
    log("built offline packages: " + ", ".join(built))

    # 6. Activate atomically ------------------------------------------------------------------------
    old = session.scalars(select(BathymetryDataset.id).where(BathymetryDataset.is_active)).all()
    session.execute(update(BathymetryDataset).where(BathymetryDataset.is_active).values(is_active=False))
    session.execute(
        update(OfflinePackage)
        .where(OfflinePackage.kind == "bathymetry", OfflinePackage.is_active)
        .values(is_active=False)
    )
    session.execute(
        update(OfflinePackage).where(OfflinePackage.dataset_id == dataset_id).values(is_active=True)
    )
    ds.is_active = True
    _upsert_layers(session, ds, provider, last_modified)
    if old:
        # Keep old metadata rows for provenance, drop their heavy derived rows.
        session.execute(delete(BathymetryContour).where(BathymetryContour.dataset_id.in_(old)))
    session.commit()
    log(
        f"activated dataset {dataset_id} in {time.monotonic() - t0:.0f}s processing",
        dataset_id=str(dataset_id),
    )
    return dataset_id


def _bbox_wkt(b: dict) -> str:
    w, s, e, n = b["west"], b["south"], b["east"], b["north"]
    return f"POLYGON(({w} {s},{e} {s},{e} {n},{w} {n},{w} {s}))"


def _upsert_layers(session: Session, ds: BathymetryDataset, provider: DataProvider, updated) -> None:
    common = {
        "provider_id": provider.id,
        "dataset_id": ds.id,
        "attribution": "Bathymetry: " + CITATION,
        "data_updated_at": updated,
        "is_active": True,
    }
    specs = [
        (
            "bathymetry-depth",
            "Depth shading (GEBCO)",
            "raster",
            DataKind.historical_compilation,
            4,
            10,
            True,
            0.55,
            "Colour-shaded depth with hillshade, translucent in shallow water.",
        ),
        (
            "bathymetry-contours",
            "Depth contours (GEBCO)",
            "vector",
            DataKind.derived_analysis,
            4,
            22,
            True,
            1.0,
            "Isobaths at " + ", ".join(str(d) for d in CONTOUR_DEPTHS_M) + " m.",
        ),
        (
            "bathymetry-slope",
            "Seafloor slope (GEBCO)",
            "raster",
            DataKind.derived_analysis,
            4,
            10,
            False,
            0.8,
            "Slope of the ~460 m grid in degrees (real reef walls are steeper).",
        ),
        (
            "bathymetry-features",
            "Drop-off & rise candidates",
            "geojson",
            DataKind.derived_analysis,
            6,
            22,
            False,
            1.0,
            "Computed candidates, not verified structures.",
        ),
    ]
    for slug, name, ltype, kind, zmin, zmax, vis, opacity, desc in specs:
        layer = session.scalar(select(MapLayer).where(MapLayer.slug == slug))
        if layer is None:
            layer = MapLayer(slug=slug)
            session.add(layer)
        layer.name, layer.layer_type, layer.data_kind = name, ltype, kind
        layer.min_zoom, layer.max_zoom, layer.default_visible, layer.default_opacity = (
            zmin,
            zmax,
            vis,
            opacity,
        )
        layer.description = desc
        for k, v in common.items():
            setattr(layer, k, v)


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Ingest GEBCO bathymetry for the Maldives")
    ap.add_argument("--keep-raw", action="store_true", help="keep the working directory")
    args = ap.parse_args()
    with sync_session_factory()() as s:
        new_job = create_job(s, {"trigger": "cli"})
    run(new_job.id, keep_raw=args.keep_raw)

"""Ocean observations from NOAA CoastWatch ERDDAP (free, no account, redistribution allowed).

Products (verified for the Maldives box):
  * Sea surface temperature: MUR SST v4.1 L4 (NASA JPL), daily, 0.01 deg (~1 km). Gap-filled analysis of
    satellite observations; the near-real-time version is replaced later by a final version.
  * Chlorophyll-a: NOAA VIIRS (S-NPP + NOAA-20) DINEOF gap-filled, near-real-time, daily, ~9 km. Cloud
    gaps are filled statistically by NOAA (DINEOF), which the app labels as such.

Derived here: SST fronts (horizontal temperature gradient, deg C per km).

Run: python -m app.ingestion.ocean
"""

import io
import time
import traceback
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx
import numpy as np
from scipy.io import netcdf_file
from sqlalchemy import select, update

from app.core import storage
from app.ingestion.analysis import M_PER_DEG_LAT, M_PER_DEG_LON_EQ
from app.ingestion.gebco import JobLog, sync_session_factory
from app.ingestion.raster_tiles import ScalarTileRenderer, tiles_for_bounds
from app.models import DataProvider, IngestionJob, JobStatus, OceanObservation, ProviderStatus
from app.services.basemap import MALDIVES_BOUNDS

B = MALDIVES_BOUNDS
OCEAN_TILE_ZOOMS = range(4, 10)


@dataclass(frozen=True)
class Product:
    variable: str  # our name
    dataset: str
    server: str
    source_var: str
    units: str
    product: str
    level: str
    valid_range: tuple[float, float]
    query: str  # ERDDAP constraint after the variable name

    def url(self) -> str:
        return f"https://{self.server}/erddap/griddap/{self.dataset}.nc?{self.source_var}{self.query}"


PRODUCTS = [
    Product(
        "sst",
        "jplMURSST41",
        "coastwatch.pfeg.noaa.gov",
        "analysed_sst",
        "degC",
        "MUR SST v4.1 (NASA JPL) via NOAA CoastWatch ERDDAP",
        "L4 daily gap-filled analysis of satellite observations, 0.01 deg",
        (-2.0, 40.0),
        f"[(last)][({B['south']}):({B['north']})][({B['west']}):({B['east']})]",
    ),
    Product(
        "chl",
        "noaacwNPPN20VIIRSDINEOFDaily",
        "coastwatch.noaa.gov",
        "chlor_a",
        "mg m-3",
        "NOAA VIIRS (S-NPP + NOAA-20) chlorophyll-a, DINEOF gap-filled, NRT, via NOAA CoastWatch ERDDAP",
        "L4 daily, ~9 km; cloud gaps filled statistically (DINEOF) from surrounding days and areas",
        (0.001, 100.0),
        f"[(last)][(0.0)][({B['north']}):({B['south']})][({B['west']}):({B['east']})]",
    ),
]

# deg C -> colour; tuned to the Maldives range (~27.5-31.5 C)
SST_STOPS = np.array(
    [
        [27.5, 44, 123, 182, 205],
        [28.5, 0, 166, 202, 205],
        [29.25, 0, 204, 188, 205],
        [29.75, 144, 235, 157, 205],
        [30.25, 255, 255, 140, 205],
        [30.75, 249, 208, 87, 205],
        [31.25, 242, 158, 46, 205],
        [32.0, 215, 25, 28, 205],
    ],
    np.float32,
)
# log10(mg m-3) -> colour (viridis-like)
CHL_STOPS = np.array(
    [
        [-1.5, 68, 1, 84, 195],
        [-1.0, 59, 82, 139, 195],
        [-0.7, 33, 145, 140, 195],
        [-0.4, 94, 201, 98, 195],
        [0.0, 253, 231, 37, 195],
        [0.8, 253, 231, 37, 195],
    ],
    np.float32,
)
# deg C per km -> colour (transparent when weak)
FRONT_STOPS = np.array(
    [
        [0.0, 255, 152, 0, 0],
        [0.015, 255, 152, 0, 0],
        [0.03, 255, 152, 0, 140],
        [0.06, 244, 67, 54, 210],
        [0.12, 183, 28, 28, 235],
    ],
    np.float32,
)


@dataclass
class OceanGrid:
    variable: str
    data: np.ndarray  # float32, NaN = missing, row 0 = north
    west: float
    north: float
    res: float
    time: datetime
    url: str
    product: Product


def parse_erddap_nc(raw: bytes, p: Product, url: str) -> OceanGrid:
    nc = netcdf_file(io.BytesIO(raw), "r", mmap=False)
    v = nc.variables[p.source_var]
    data = np.asarray(v[:], dtype=np.float32).squeeze()
    for attr in ("_FillValue", "missing_value"):
        fill = getattr(v, attr, None)
        if fill is not None and np.isfinite(fill):
            data[np.isclose(data, fill)] = np.nan
    if p.variable == "chl":
        data[data <= -900] = np.nan  # land flag in the DINEOF product
    lat = np.asarray(nc.variables["latitude"][:], dtype=np.float64)
    lon = np.asarray(nc.variables["longitude"][:], dtype=np.float64)
    t = float(nc.variables["time"][:][-1])
    if lat[0] < lat[-1]:  # make north-up
        data, lat = data[::-1], lat[::-1]
    res = float(abs(lat[-1] - lat[0]) / (len(lat) - 1))  # robust to float32 axis rounding
    return OceanGrid(
        p.variable,
        data,
        float(lon[0] - res / 2),
        float(lat[0] + res / 2),
        res,
        datetime.fromtimestamp(t, UTC),
        url,
        p,
    )


def validate(g: OceanGrid) -> dict:
    finite = np.isfinite(g.data)
    if not finite.any():
        raise ValueError(f"{g.variable}: no valid cells")
    lo, hi = float(np.nanmin(g.data)), float(np.nanmax(g.data))
    if lo < g.product.valid_range[0] or hi > g.product.valid_range[1]:
        raise ValueError(f"{g.variable}: values {lo}..{hi} outside {g.product.valid_range}")
    if g.variable == "sst" and finite.mean() < 0.9:
        raise ValueError("sst: L4 analysis should cover almost every ocean cell")
    age_days = (datetime.now(UTC) - g.time).total_seconds() / 86400
    return {
        "min": round(lo, 4),
        "max": round(hi, 4),
        "median": round(float(np.nanmedian(g.data)), 4),
        "valid_fraction": round(float(finite.mean()), 4),
        "shape": list(g.data.shape),
        "age_days_at_ingest": round(age_days, 2),
    }


def sst_front(g: OceanGrid) -> np.ndarray:
    """Horizontal SST gradient magnitude in deg C per km (central differences, metric spacing)."""
    lats = g.north - (np.arange(g.data.shape[0]) + 0.5) * g.res
    dx = g.res * M_PER_DEG_LON_EQ * np.cos(np.radians(lats)) / 1000.0
    dy = g.res * M_PER_DEG_LAT / 1000.0
    gy, gx = np.gradient(g.data.astype(np.float64))
    return np.hypot(gx / dx[:, None], gy / dy).astype(np.float32)


def colorize(stops: np.ndarray, transform=None):
    def f(values: np.ndarray) -> np.ndarray:
        v = values if transform is None else transform(values)
        out = np.empty(values.shape + (4,), np.float32)
        for i in range(4):
            out[..., i] = np.interp(np.nan_to_num(v, nan=stops[0, 0]), stops[:, 0], stops[:, i + 1])
        out[..., 3] = np.where(np.isfinite(values), out[..., 3], 0)
        return out

    return f


def log10_safe(v):
    with np.errstate(all="ignore"):
        return np.log10(v)


def publish_tiles(prefix: str, data: np.ndarray, west: float, north: float, res: float, colour, zooms) -> int:
    from concurrent.futures import ThreadPoolExecutor

    r = ScalarTileRenderer(data, west, north, res, colour)
    jobs = [
        (z, x, y) for z in zooms for x, y in tiles_for_bounds(B["west"], B["south"], B["east"], B["north"], z)
    ]

    def one(zxy):
        png = r.render(*zxy)
        if png:
            storage.put_bytes(f"{prefix}/{zxy[0]}/{zxy[1]}/{zxy[2]}.png", png, "image/png")
            return 1
        return 0

    with ThreadPoolExecutor(8) as pool:
        return sum(pool.map(one, jobs))


def save_grid(key: str, g_data: np.ndarray, west: float, north: float, res: float) -> None:
    buf = io.BytesIO()
    np.savez_compressed(buf, data=g_data, west=west, north=north, res=res)
    storage.put_bytes(key, buf.getvalue(), "application/octet-stream")


def run(job_id: uuid.UUID, fetch=None) -> list[uuid.UUID]:
    Session_ = sync_session_factory()
    with Session_() as session:
        job = session.get(IngestionJob, job_id)
        provider = session.get(DataProvider, job.provider_id)
        job.status, job.started_at = JobStatus.running, datetime.now(UTC)
        session.commit()
        log = JobLog(session, job)
        try:
            ids = _run(session, job, provider, log, fetch)
            job.status, job.finished_at = JobStatus.succeeded, datetime.now(UTC)
            provider.status, provider.last_success_at, provider.last_error = (
                ProviderStatus.ok,
                job.finished_at,
                None,
            )
            return ids
        except Exception as exc:
            session.rollback()
            job = session.get(IngestionJob, job_id)
            provider = session.get(DataProvider, job.provider_id)
            job.status, job.finished_at = JobStatus.failed, datetime.now(UTC)
            job.error = f"{type(exc).__name__}: {exc}\n{traceback.format_exc(limit=5)}"
            has = session.scalar(select(OceanObservation.id).where(OceanObservation.is_latest))
            provider.status = ProviderStatus.degraded if has else ProviderStatus.failing
            provider.last_error = f"{type(exc).__name__}: {exc}"
            raise
        finally:
            provider.last_checked_at = datetime.now(UTC)
            session.commit()


def _default_fetch(p: Product) -> bytes:
    with httpx.Client(timeout=httpx.Timeout(60, read=300), follow_redirects=True) as c:
        r = c.get(p.url())
        r.raise_for_status()
        return r.content


def _run(session, job, provider, log, fetch) -> list[uuid.UUID]:
    t0 = time.monotonic()
    storage.ensure_bucket()
    fetch = fetch or _default_fetch
    grids: dict[str, OceanGrid] = {}
    for p in PRODUCTS:
        raw = fetch(p)
        g = parse_erddap_nc(raw, p, p.url())
        stats = validate(g)
        grids[p.variable] = g
        log(
            f"{p.variable}: {g.time:%Y-%m-%d} {stats['shape']} valid {stats['valid_fraction']:.0%} "
            f"range {stats['min']}..{stats['max']} {p.units}",
            **{p.variable: stats},
        )

    sst = grids["sst"]
    front = sst_front(sst)
    layers = [
        ("sst", sst.data, sst, SST_STOPS, None, sst.product.units, "observation"),
        (
            "chl",
            grids["chl"].data,
            grids["chl"],
            CHL_STOPS,
            log10_safe,
            grids["chl"].product.units,
            "observation",
        ),
        ("sst_front", front, sst, FRONT_STOPS, None, "degC km-1", "derived_analysis"),
    ]
    ids = []
    batch = uuid.uuid4().hex[:12]
    for name, data, src, stops, tf, units, kind in layers:
        oid = uuid.uuid4()
        prefix = f"ocean/{name}/{src.time:%Y%m%d}-{batch}"
        save_grid(f"{prefix}/grid.npz", data, src.west, src.north, src.res)
        n = publish_tiles(
            f"{prefix}/tiles", data, src.west, src.north, src.res, colorize(stops, tf), OCEAN_TILE_ZOOMS
        )
        finite = np.isfinite(data)
        session.execute(
            update(OceanObservation)
            .where(OceanObservation.variable == name, OceanObservation.is_latest)
            .values(is_latest=False)
        )
        session.add(
            OceanObservation(
                id=oid,
                provider_id=provider.id,
                job_id=job.id,
                variable=name,
                units=units,
                data_kind=kind,
                product=src.product.product
                if name != "sst_front"
                else "Derived from MUR SST: gradient magnitude",
                product_level=src.product.level if name != "sst_front" else "Derived, same grid as SST",
                observed_at=src.time,
                source_url=src.url,
                resolution_deg=src.res,
                bounds=[
                    src.west,
                    src.north - src.res * data.shape[0],
                    src.west + src.res * data.shape[1],
                    src.north,
                ],
                stats={
                    "min": float(np.nanmin(data)),
                    "max": float(np.nanmax(data)),
                    "median": float(np.nanmedian(data)),
                    "valid_fraction": float(finite.mean()),
                },
                grid_key=f"{prefix}/grid.npz",
                tiles_prefix=f"{prefix}/tiles",
                tile_count=n,
                is_latest=True,
            )
        )
        session.commit()
        ids.append(oid)
        log(f"{name}: published {n} tiles")
    log(f"ocean ingestion finished in {time.monotonic() - t0:.0f}s")
    return ids


def create_job(session) -> IngestionJob:
    provider = session.scalar(select(DataProvider).where(DataProvider.slug == "noaa_coastwatch"))
    job = IngestionJob(provider_id=provider.id, job_type="ocean_noaa", params={}, stats={}, log=[])
    session.add(job)
    session.commit()
    return job


if __name__ == "__main__":
    with sync_session_factory()() as s:
        j = create_job(s)
    run(j.id)
    from app.ingestion import fishing

    fishing.main()

"""Integration test fixtures: tests run against a real PostGIS database, Redis and S3 storage.

Start them with `docker compose up -d db redis s3` (from the repo root). The test
database `jigmap_test` is created and migrated with Alembic automatically.
"""

import os
import subprocess
import sys

import psycopg
import pytest

ADMIN_DSN = os.environ.get("TEST_ADMIN_DSN", "postgresql://jigmap:jigmap@localhost:5432/jigmap")
TEST_DB = "jigmap_test"
os.environ["DATABASE_URL"] = f"postgresql+asyncpg://jigmap:jigmap@localhost:5432/{TEST_DB}"
os.environ["REDIS_URL"] = os.environ.get("TEST_REDIS_URL", "redis://localhost:6379/15")
os.environ["ENVIRONMENT"] = "test"
os.environ["SATELLITE_PROVIDER"] = "esri_public_dev"
os.environ["S3_BUCKET"] = os.environ.get("TEST_S3_BUCKET", "jigmap-test")
os.environ["S3_ENDPOINT_URL"] = os.environ.get("TEST_S3_ENDPOINT_URL", "http://localhost:9000")
os.environ["DATA_DIR"] = os.environ.get(
    "TEST_DATA_DIR", os.path.join(os.path.dirname(__file__), "..", ".data", "test")
)

import httpx  # noqa: E402
import redis as sync_redis  # noqa: E402

from app.core.config import get_settings  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _database():
    with psycopg.connect(ADMIN_DSN, autocommit=True) as conn:
        conn.execute(f"DROP DATABASE IF EXISTS {TEST_DB} WITH (FORCE)")
        conn.execute(f"CREATE DATABASE {TEST_DB}")
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True)
    yield


@pytest.fixture(autouse=True)
def _clean_redis():
    sync_redis.Redis.from_url(os.environ["REDIS_URL"]).flushdb()
    yield


@pytest.fixture(autouse=True)
def _fresh_settings():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
async def client():
    from app.main import create_app

    app = create_app()
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
            yield c


def unique_email(prefix: str = "captain") -> str:
    import uuid

    return f"{prefix}-{uuid.uuid4().hex[:10]}@example.mv"


@pytest.fixture(scope="session")
def ingested_dataset(_database):
    """Run the real ingestion pipeline on a committed excerpt of the GEBCO 2026 grid."""
    import json
    import uuid

    import numpy as np

    from app.core import storage
    from app.ingestion import gebco
    from app.ingestion.packages import Region

    storage.reset_client()
    get_settings.cache_clear()
    fx = np.load(os.path.join(os.path.dirname(__file__), "fixtures", "gebco2026_male_excerpt.npz"))
    meta = json.loads(str(fx["meta"]))

    def source(log, workdir):
        log("loaded GEBCO 2026 excerpt fixture")
        return gebco.SourceGrid(
            fx["elevation"],
            fx["tid"],
            meta["bounds"],
            {"fixture": "gebco2026_male_excerpt"},
            None,
            {"grid": "tests/fixtures/gebco2026_male_excerpt.npz"},
        )

    with gebco.sync_session_factory()() as s:
        job = gebco.create_job(s, {"trigger": "test"})
    gebco.run(
        job.id,
        source=source,
        regions=[Region("test-male", "Malé test region", meta["bounds"])],
        tile_zooms=range(8, 11),
    )
    with gebco.sync_session_factory()() as s:
        from app.models import BathymetryDataset

        ds = s.query(BathymetryDataset).filter_by(is_active=True).one()
        return {"id": uuid.UUID(str(ds.id)), "job_id": job.id, "bounds": meta["bounds"]}

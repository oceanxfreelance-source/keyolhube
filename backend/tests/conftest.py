"""Integration test fixtures: tests run against a real PostGIS database and Redis.

Start them with `docker compose up -d db redis` (from the repo root). The test
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

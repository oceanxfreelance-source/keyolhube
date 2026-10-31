from datetime import UTC, datetime

from fastapi import APIRouter, Response, status
from sqlalchemy import text

from app.api.deps import DbSession
from app.core.redis import get_redis

router = APIRouter(tags=["health"])


@router.get("/health/live", summary="Process is running")
async def live() -> dict:
    return {"status": "ok"}


@router.get("/health/ready", summary="Database (with PostGIS) and Redis are reachable")
async def ready(db: DbSession, response: Response) -> dict:
    checks: dict = {}
    try:
        checks["postgres"] = {"status": "ok", "version": await db.scalar(text("SHOW server_version"))}
        checks["postgis"] = {"status": "ok", "version": await db.scalar(text("SELECT postgis_lib_version()"))}
    except Exception as exc:  # noqa: BLE001 - any DB failure means not ready
        checks["postgres"] = {"status": "error", "error": type(exc).__name__}
    try:
        await get_redis().ping()
        checks["redis"] = {"status": "ok"}
    except Exception as exc:  # noqa: BLE001
        checks["redis"] = {"status": "error", "error": type(exc).__name__}

    ok = all(c["status"] == "ok" for c in checks.values()) and "postgis" in checks
    if not ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {
        "status": "ok" if ok else "unavailable",
        "checks": checks,
        "checked_at": datetime.now(UTC).isoformat(),
    }

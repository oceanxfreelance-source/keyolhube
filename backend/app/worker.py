"""Celery application for background jobs (data ingestion arrives in Phase 3)."""

from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery("jigmap", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    result_expires=3600,
)


@celery_app.task(name="system.ping")
def ping() -> str:
    """Round-trip check used by the readiness probe and tests."""
    return "pong"


@celery_app.task(name="bathymetry.ingest_gebco", acks_late=True, time_limit=3 * 3600)
def ingest_gebco(job_id: str) -> str:
    import uuid

    from app.ingestion import gebco

    gebco.run(uuid.UUID(job_id))
    return job_id

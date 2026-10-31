from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import DbSession, require_role
from app.models import DataProvider, IngestionJob, JobStatus, UserRole

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_role(UserRole.admin))])


def job_out(j: IngestionJob) -> dict:
    return {
        "id": str(j.id),
        "job_type": j.job_type,
        "status": j.status.value,
        "params": j.params,
        "stats": j.stats,
        "log": j.log,
        "error": j.error,
        "created_at": j.created_at.isoformat(),
        "started_at": j.started_at.isoformat() if j.started_at else None,
        "finished_at": j.finished_at.isoformat() if j.finished_at else None,
    }


@router.post("/ingestion/gebco", status_code=status.HTTP_202_ACCEPTED, summary="Queue a GEBCO ingestion job")
async def queue_gebco(db: DbSession) -> dict:
    provider = await db.scalar(select(DataProvider).where(DataProvider.slug == "gebco"))
    running = await db.scalar(
        select(IngestionJob.id).where(
            IngestionJob.provider_id == provider.id,
            IngestionJob.status.in_([JobStatus.queued, JobStatus.running]),
        )
    )
    if running:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A GEBCO job is already in progress ({running})")
    job = IngestionJob(
        provider_id=provider.id,
        job_type="gebco_bathymetry",
        params={"trigger": "admin_api"},
        stats={},
        log=[],
    )
    db.add(job)
    await db.commit()
    from app.worker import ingest_gebco

    ingest_gebco.delay(str(job.id))
    return {"job_id": str(job.id), "status": "queued"}


@router.get("/ingestion/jobs", summary="Recent ingestion jobs")
async def jobs(db: DbSession, limit: int = Query(20, ge=1, le=100)) -> list[dict]:
    rows = (
        await db.scalars(select(IngestionJob).order_by(IngestionJob.created_at.desc()).limit(limit))
    ).all()
    return [job_out(j) for j in rows]

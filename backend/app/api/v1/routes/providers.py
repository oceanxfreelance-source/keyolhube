from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import DbSession
from app.models import DataProvider

router = APIRouter(prefix="/data-providers", tags=["data providers"])


@router.get("", summary="Status of every external data provider (connected or not)")
async def providers(db: DbSession) -> list[dict]:
    rows = (await db.scalars(select(DataProvider).order_by(DataProvider.category, DataProvider.slug))).all()
    return [
        {
            "slug": p.slug,
            "name": p.name,
            "category": p.category,
            "status": p.status.value,
            "homepage": p.homepage,
            "licence": p.licence,
            "attribution": p.attribution,
            "last_checked_at": p.last_checked_at.isoformat() if p.last_checked_at else None,
            "last_success_at": p.last_success_at.isoformat() if p.last_success_at else None,
            "last_error": p.last_error,
        }
        for p in rows
    ]

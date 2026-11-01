from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import DbSession
from app.models import FadList, FadPosition

router = APIRouter(prefix="/fads", tags=["fishing"])


@router.get("", summary="Official FAD positions (Ministry of Fisheries lists) as GeoJSON")
async def fads(db: DbSession) -> dict:
    lists = {lst.id: lst for lst in (await db.scalars(select(FadList).where(FadList.is_latest))).all()}
    if not lists:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "FAD lists not loaded yet")
    rows = (
        await db.scalars(
            select(FadPosition)
            .where(FadPosition.list_id.in_(lists))
            .order_by(FadPosition.list_id, FadPosition.row_no)
        )
    ).all()
    return {
        "type": "FeatureCollection",
        "lists": [
            {
                "list_type": v.list_type,
                "title": v.title,
                "source_url": v.source_url,
                "sha256": v.sha256,
                "rows": v.row_count,
                "fetched_at": v.fetched_at.isoformat(),
            }
            for v in lists.values()
        ],
        "notice": "Positions are where the FADs were deployed, as published by the Ministry. FADs can drift, "
        "sink or break away after the list date; rows marked broken_away are reported detached.",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [r.lon, r.lat]},
                "properties": {
                    "code": r.code,
                    "list_type": lists[r.list_id].list_type,
                    "row_no": r.row_no,
                    "status": r.status,
                    "deployed_on": r.deployed_on.isoformat() if r.deployed_on else None,
                    "published_lat": r.raw_lat,
                    "published_lon": r.raw_lon,
                    "listed_distance_nm": r.listed_distance_nm,
                    "grid_depth_m": r.grid_depth_m,
                    "notes": r.notes,
                },
            }
            for r in rows
        ],
    }

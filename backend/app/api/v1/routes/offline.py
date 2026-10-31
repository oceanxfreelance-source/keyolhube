import asyncio

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response
from geoalchemy2.functions import ST_AsGeoJSON
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.core import storage
from app.models import OfflineDownload, OfflinePackage

router = APIRouter(prefix="/offline", tags=["offline"])


@router.get("/packages", summary="Active offline packages")
async def list_packages(db: DbSession) -> list[dict]:
    import json

    rows = (
        await db.execute(
            select(OfflinePackage, ST_AsGeoJSON(OfflinePackage.bounds))
            .where(OfflinePackage.is_active)
            .order_by(OfflinePackage.slug)
        )
    ).all()
    return [
        {
            "id": str(p.id),
            "slug": p.slug,
            "name": p.name,
            "kind": p.kind,
            "bounds": json.loads(b),
            "size_bytes": p.size_bytes,
            "sha256": p.sha256,
            "contents": p.contents,
            "data_updated_at": p.data_updated_at.isoformat(),
            "created_at": p.created_at.isoformat(),
            "download_url": f"/api/v1/offline/packages/{p.id}/download",
        }
        for p, b in rows
    ]


@router.get("/packages/{package_id}/download", summary="Download a package (signed-in users)")
async def download(package_id: str, db: DbSession, user: CurrentUser) -> Response:
    pkg = await db.get(OfflinePackage, package_id)
    if pkg is None or not pkg.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Package not found")
    data = await asyncio.to_thread(storage.get_bytes, pkg.s3_key)
    if data is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Package file missing from storage")
    db.add(OfflineDownload(user_id=user.id, package_id=pkg.id, package_sha256=pkg.sha256))
    await db.commit()
    return Response(
        data,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{pkg.slug}.zip"',
            "X-Content-SHA256": pkg.sha256,
            "Cache-Control": "private, no-store",
        },
    )


@router.get("/downloads", summary="My offline downloads")
async def my_downloads(db: DbSession, user: CurrentUser) -> list[dict]:
    rows = (
        await db.execute(
            select(OfflineDownload, OfflinePackage.slug)
            .join(OfflinePackage)
            .where(OfflineDownload.user_id == user.id)
            .order_by(OfflineDownload.downloaded_at.desc())
            .limit(100)
        )
    ).all()
    return [
        {"package": slug, "sha256": d.package_sha256, "downloaded_at": d.downloaded_at.isoformat()}
        for d, slug in rows
    ]

from fastapi import APIRouter, HTTPException, Response, status

from app.api.deps import DbSession
from app.services import imagery

router = APIRouter(prefix="/imagery", tags=["imagery"])


@router.get("/mosaics/active", summary="Active self-built satellite mosaic (Sentinel-2) with provenance")
async def active(db: DbSession) -> dict:
    m = await imagery.active_mosaic(db)
    if m is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Sentinel-2 mosaic not built yet")
    return imagery.summary(m)


@router.get("/tiles/{z}/{x}/{y}.webp", summary="Sentinel-2 mosaic tiles (free, offline storage permitted)")
async def tile(db: DbSession, z: int, x: int, y: int) -> Response:
    if not (0 <= z <= 22 and 0 <= x < 2**z and 0 <= y < 2**z):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tile out of range")
    m = await imagery.active_mosaic(db)
    if m is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Sentinel-2 mosaic not built yet")
    data = await imagery.mosaic_tile(m, z, x, y)
    if data is None:
        return Response(status_code=204, headers={"Cache-Control": "public, max-age=86400"})
    return Response(data, media_type="image/webp", headers={"Cache-Control": "public, max-age=604800"})

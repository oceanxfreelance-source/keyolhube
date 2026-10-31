from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, Response, status

from app.api.deps import DbSession
from app.services import ocean as svc

router = APIRouter(prefix="/ocean", tags=["ocean & fishing"])
LAYER = Literal["sst", "chl", "sst_front", "tuna_habitat", "jigging_zones"]


@router.get("/latest", summary="Latest ocean observations and fishing predictions with provenance")
async def latest(db: DbSession) -> dict:
    obs, pred = await svc.latest(db)
    return {
        "observations": {k: svc.obs_summary(v) for k, v in obs.items()},
        "predictions": {k: svc.pred_summary(v) for k, v in pred.items()},
        "not_connected": {
            "currents": "Ocean current vectors are not connected yet.",
            "wind_waves": "Marine weather (wind, waves, rain) provider not selected yet (Phase 4).",
        },
    }


@router.get("/tiles/{layer}/{z}/{x}/{y}.png", summary="Ocean / fishing layer tiles")
async def tiles(db: DbSession, layer: LAYER, z: int, x: int, y: int) -> Response:
    obs, pred = await svc.latest(db)
    rec = obs.get(layer) or pred.get(layer)
    if rec is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"{layer} not available yet")
    data = await svc.tile(rec.tiles_prefix, z, x, y)
    if data is None:
        return Response(status_code=204, headers={"Cache-Control": "public, max-age=3600"})
    return Response(data, media_type="image/png", headers={"Cache-Control": "public, max-age=3600"})


@router.get("/point", summary="Ocean values, tuna-habitat breakdown and jigging zone at a point")
async def point(
    db: DbSession,
    lat: Annotated[float, Query(ge=-90, le=90)],
    lon: Annotated[float, Query(ge=-180, le=180)],
) -> dict:
    return await svc.point(db, lat, lon)

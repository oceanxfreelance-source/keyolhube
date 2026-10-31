import logging
from datetime import UTC, datetime
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.exceptions import RedisError

from app.api.deps import DbSession, get_current_user
from app.core.config import get_settings
from app.core.redis import get_redis
from app.services import imagery
from app.services.basemap import (
    MALDIVES_BOUNDS,
    MALDIVES_DEFAULT_CENTER,
    MALDIVES_DEFAULT_ZOOM,
    SENTINEL2_TILE_PATH,
    ProviderNotConfigured,
    RasterProvider,
    build_style,
    check_provider,
    issue_tile_token,
    resolve_provider,
    verify_tile_token,
)
from app.services.map_overlays import bathymetry_overlays, ocean_overlays

router = APIRouter(prefix="/map", tags=["map"])

_optional_bearer = HTTPBearer(auto_error=False)


def get_provider() -> RasterProvider:
    try:
        return resolve_provider(get_settings())
    except ProviderNotConfigured as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Satellite provider not configured: {exc}",
        ) from exc


Provider = Annotated[RasterProvider, Depends(get_provider)]
log = logging.getLogger(__name__)


def _base(request: Request) -> str:
    return (get_settings().public_base_url or str(request.base_url)).rstrip("/")


def _merge(a: dict | None, b: dict | None) -> dict | None:
    if not a or not b:
        return a or b
    # Ocean/fishing rasters go below the bathymetry contours and features so lines stay readable.
    depth_layers = [lyr for lyr in a["layers"] if lyr["type"] == "raster"]
    other = [lyr for lyr in a["layers"] if lyr["type"] != "raster"]
    return {
        "sources": {**a["sources"], **b["sources"]},
        "layers": depth_layers + b["layers"] + other,
        "metadata": a["metadata"] + b["metadata"],
    }


def _usage_key() -> str:
    return f"imagery:tiles:{datetime.now(UTC):%Y-%m}"


async def _monthly_usage() -> int | None:
    try:
        v = await get_redis().get(_usage_key())
    except RedisError:
        return None
    return int(v or 0)


@router.get("/config", summary="Region, basemap and overlay layer metadata")
async def map_config(request: Request, provider: Provider, db: DbSession) -> dict:
    settings = get_settings()
    overlays = _merge(await bathymetry_overlays(db, _base(request)), await ocean_overlays(db, _base(request)))
    mosaic = await imagery.active_mosaic(db)
    attribution = mosaic.attribution if provider.id == "sentinel2_jigmap" and mosaic else provider.attribution
    usage = None
    if provider.requires_proxy:
        usage = {
            "tiles_this_month": await _monthly_usage(),
            "monthly_cap": settings.imagery_monthly_tile_cap,
            "fallback": "sentinel2_jigmap" if mosaic else None,
        }
    return {
        "imagery": imagery.summary(mosaic) if mosaic else None,
        "imagery_usage": usage,
        "layers": overlays["metadata"] if overlays else [],
        "region": {
            "name": "Maldives EEZ (approximate envelope)",
            "bounds": MALDIVES_BOUNDS,
            "default_center": MALDIVES_DEFAULT_CENTER,
            "default_zoom": MALDIVES_DEFAULT_ZOOM,
        },
        "basemap": {
            "id": provider.id,
            "name": provider.name,
            "attribution": attribution,
            "imagery_ready": provider.id != "sentinel2_jigmap" or mosaic is not None,
            "max_zoom": provider.max_zoom,
            "licence_status": provider.licence_status,
            "licence_note": provider.licence_note,
            "offline_caching": provider.offline_caching,
            "requires_sign_in": provider.requires_proxy,
            # Satellite imagery is an archived mosaic, not a live observation.
            "data_kind": "imagery_mosaic",
        },
    }


@router.get(
    "/style.json",
    summary="MapLibre style for the satellite basemap",
    description="Keyed providers require a bearer token; the style then points at the tile proxy.",
)
async def map_style(
    request: Request,
    provider: Provider,
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_optional_bearer)],
) -> dict:
    settings = get_settings()
    base = _base(request)
    overlays = _merge(await bathymetry_overlays(db, base), await ocean_overlays(db, base))
    if provider.id == "sentinel2_jigmap":
        mosaic = await imagery.active_mosaic(db)
        extra = {"bounds": mosaic.bounds, "minzoom": mosaic.min_zoom} if mosaic else {}
        return build_style(
            provider,
            f"{base}{settings.api_v1_prefix}{SENTINEL2_TILE_PATH}",
            overlays,
            attribution=mosaic.attribution if mosaic else None,
            source_extra=extra,
        )
    if not provider.requires_proxy:
        return build_style(provider, provider.upstream_url, overlays)
    user = await get_current_user(db, credentials)  # raises 401 when not signed in
    token, _ = issue_tile_token(settings, str(user.id))
    tiles_url = f"{base}{settings.api_v1_prefix}/map/tiles/{{z}}/{{x}}/{{y}}?t={token}"
    return build_style(provider, tiles_url, overlays)


@router.get("/tiles/{z}/{x}/{y}", summary="Tile proxy for keyed providers", include_in_schema=True)
async def tile_proxy(
    z: int, x: int, y: int, provider: Provider, db: DbSession, t: Annotated[str, Query(min_length=10)]
) -> Response:
    if not provider.requires_proxy:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Provider is served directly")
    settings = get_settings()
    if not verify_tile_token(settings, t):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired tile token")
    if not (0 <= z <= provider.max_zoom and 0 <= x < 2**z and 0 <= y < 2**z):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tile coordinates out of range")
    if settings.imagery_monthly_tile_cap > 0:
        try:
            redis = get_redis()
            used = await redis.incr(_usage_key())
            if used == 1:
                await redis.expire(_usage_key(), 40 * 24 * 3600)
        except RedisError:
            log.warning("tile counter unavailable; refusing keyed tiles to protect the free tier")
            used = settings.imagery_monthly_tile_cap + 1
        if used > settings.imagery_monthly_tile_cap:
            # Free tier protected: serve our own Sentinel-2 mosaic instead of a billable tile.
            mosaic = await imagery.active_mosaic(db)
            data = await imagery.mosaic_tile(mosaic, z, x, y) if mosaic else None
            if data is None:
                return Response(status_code=204, headers={"X-Imagery-Fallback": "cap-reached"})
            return Response(
                data,
                media_type="image/webp",
                headers={"X-Imagery-Fallback": "sentinel2", "Cache-Control": "private, max-age=86400"},
            )
    client: httpx.AsyncClient = _tile_client()
    try:
        upstream = await client.get(provider.tile_url(z, x, y), timeout=15.0)
    except httpx.HTTPError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Imagery provider unreachable") from None
    if upstream.status_code != 200:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Imagery provider returned {upstream.status_code}")
    return Response(
        content=upstream.content,
        media_type=upstream.headers.get("content-type", "image/jpeg"),
        headers={"Cache-Control": "private, max-age=86400"},
    )


@router.get("/provider-status", summary="Live check: fetch one real tile from the provider")
async def provider_status(provider: Provider, db: DbSession) -> dict:
    if provider.id == "sentinel2_jigmap":
        mosaic = await imagery.active_mosaic(db)
        result = {
            "provider": provider.id,
            "licence_status": provider.licence_status,
            "checked_at": datetime.now(UTC).isoformat(),
        }
        if mosaic is None:
            return {
                **result,
                "reachable": False,
                "error": "Mosaic not built yet (run app.ingestion.sentinel2)",
            }
        b = mosaic.bounds
        from app.services.basemap import lonlat_to_tile

        x, y = lonlat_to_tile((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, mosaic.min_zoom)
        data = await imagery.mosaic_tile(mosaic, mosaic.min_zoom, x, y)
        return {
            **result,
            "reachable": data is not None,
            "mosaic": imagery.summary(mosaic),
            "test_tile": {"z": mosaic.min_zoom, "x": x, "y": y, "bytes": len(data or b"")},
        }
    return await check_provider(provider, _tile_client())


_client: httpx.AsyncClient | None = None


def _tile_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(follow_redirects=True, headers={"User-Agent": "JigMap-Maldives/0.1"})
    return _client


async def close_tile_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
    _client = None

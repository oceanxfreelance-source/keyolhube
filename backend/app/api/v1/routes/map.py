from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.api.deps import DbSession, get_current_user
from app.core.config import get_settings
from app.services.basemap import (
    MALDIVES_BOUNDS,
    MALDIVES_DEFAULT_CENTER,
    MALDIVES_DEFAULT_ZOOM,
    ProviderNotConfigured,
    RasterProvider,
    build_style,
    check_provider,
    issue_tile_token,
    resolve_provider,
    verify_tile_token,
)

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


@router.get("/config", summary="Region and basemap metadata")
async def map_config(provider: Provider) -> dict:
    return {
        "region": {
            "name": "Maldives EEZ (approximate envelope)",
            "bounds": MALDIVES_BOUNDS,
            "default_center": MALDIVES_DEFAULT_CENTER,
            "default_zoom": MALDIVES_DEFAULT_ZOOM,
        },
        "basemap": {
            "id": provider.id,
            "name": provider.name,
            "attribution": provider.attribution,
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
    if not provider.requires_proxy:
        return build_style(provider, provider.upstream_url)
    user = await get_current_user(db, credentials)  # raises 401 when not signed in
    settings = get_settings()
    token, _ = issue_tile_token(settings, str(user.id))
    base = str(request.base_url).rstrip("/")
    tiles_url = f"{base}{settings.api_v1_prefix}/map/tiles/{{z}}/{{x}}/{{y}}?t={token}"
    return build_style(provider, tiles_url)


@router.get("/tiles/{z}/{x}/{y}", summary="Tile proxy for keyed providers", include_in_schema=True)
async def tile_proxy(
    z: int, x: int, y: int, provider: Provider, t: Annotated[str, Query(min_length=10)]
) -> Response:
    if not provider.requires_proxy:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Provider is served directly")
    if not verify_tile_token(get_settings(), t):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired tile token")
    if not (0 <= z <= provider.max_zoom and 0 <= x < 2**z and 0 <= y < 2**z):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tile coordinates out of range")
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
async def provider_status(provider: Provider) -> dict:
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

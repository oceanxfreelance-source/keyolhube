"""Satellite basemap providers, MapLibre style generation and the keyed-tile proxy.

Provider credentials never leave the server. For providers that need a key, the
style points MapLibre at this API's tile proxy, which only accepts short-lived
signed tile tokens issued to signed-in users. `check_provider` makes a real tile
request so provider status reflects reality rather than configuration.

See docs/data-sources.md for the licensing evaluation behind each provider.
"""

import math
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import httpx
import jwt

from app.core.config import Settings

# Approximate envelope of the Maldives EEZ (WGS84). Initial camera and, later,
# the bounding box for data ingestion.
MALDIVES_BOUNDS = {"west": 70.0, "south": -3.5, "east": 77.5, "north": 8.5}
MALDIVES_DEFAULT_CENTER = {"lat": 4.1755, "lon": 73.5093}  # Malé
MALDIVES_DEFAULT_ZOOM = 6.0


class ProviderNotConfigured(Exception):
    pass


@dataclass(frozen=True)
class RasterProvider:
    id: str
    name: str
    upstream_url: str  # XYZ template with {z}/{x}/{y}; may contain a secret key
    attribution: str
    max_zoom: int
    tile_size: int
    licence_status: str  # "development_only" | "commercial_with_account" | "operator_supplied"
    licence_note: str
    requires_proxy: bool  # True when upstream_url embeds a credential
    offline_caching: str  # what the licence says about offline storage, for Phase 2

    def tile_url(self, z: int, x: int, y: int) -> str:
        return self.upstream_url.replace("{z}", str(z)).replace("{x}", str(x)).replace("{y}", str(y))


def resolve_provider(settings: Settings) -> RasterProvider:
    match settings.satellite_provider:
        case "esri_public_dev":
            return RasterProvider(
                id="esri_public_dev",
                name="Esri World Imagery (public endpoint, development)",
                upstream_url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                attribution="Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community",
                max_zoom=19,
                tile_size=256,
                licence_status="development_only",
                licence_note=(
                    "Development/evaluation only. Production requires an ArcGIS Location Platform "
                    "account (SATELLITE_PROVIDER=esri_location_platform). "
                    "Refused when ENVIRONMENT=production."
                ),
                requires_proxy=False,
                offline_caching="not_permitted",
            )
        case "esri_location_platform":
            if not settings.esri_api_key:
                raise ProviderNotConfigured("ESRI_API_KEY is not set")
            return RasterProvider(
                id="esri_location_platform",
                name="Esri World Imagery (ArcGIS Location Platform)",
                upstream_url=(
                    "https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/"
                    f"{{z}}/{{y}}/{{x}}?token={settings.esri_api_key}"
                ),
                attribution="Powered by Esri | Imagery © Esri, Maxar, Earthstar Geographics",
                max_zoom=19,
                tile_size=256,
                licence_status="commercial_with_account",
                licence_note="Usage billed to the configured ArcGIS Location Platform account.",
                requires_proxy=True,
                offline_caching="per_esri_terms_verify_before_enabling",
            )
        case "mapbox_satellite":
            if not settings.mapbox_access_token:
                raise ProviderNotConfigured("MAPBOX_ACCESS_TOKEN is not set")
            return RasterProvider(
                id="mapbox_satellite",
                name="Mapbox Satellite",
                upstream_url=(
                    "https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90"
                    f"?access_token={settings.mapbox_access_token}"
                ),
                attribution="© Mapbox © OpenStreetMap © Maxar",
                max_zoom=19,
                tile_size=512,
                licence_status="commercial_with_account",
                licence_note="Usage billed to the configured Mapbox account.",
                requires_proxy=True,
                offline_caching="not_permitted_outside_mapbox_sdk_offline",
            )
        case "maptiler_satellite":
            if not settings.maptiler_api_key:
                raise ProviderNotConfigured("MAPTILER_API_KEY is not set")
            return RasterProvider(
                id="maptiler_satellite",
                name="MapTiler Satellite",
                upstream_url=f"https://api.maptiler.com/tiles/satellite-v2/{{z}}/{{x}}/{{y}}.jpg?key={settings.maptiler_api_key}",
                attribution="© MapTiler © OpenStreetMap contributors",
                max_zoom=20,
                tile_size=256,
                licence_status="commercial_with_account",
                licence_note="Usage billed to the configured MapTiler plan.",
                requires_proxy=True,
                offline_caching="plan_dependent_verify_before_enabling",
            )
        case "custom_xyz":
            if not settings.custom_xyz_url:
                raise ProviderNotConfigured("CUSTOM_XYZ_URL is not set")
            return RasterProvider(
                id="custom_xyz",
                name="Operator-supplied imagery",
                upstream_url=settings.custom_xyz_url,
                attribution=settings.custom_xyz_attribution or "",
                max_zoom=19,
                tile_size=256,
                licence_status="operator_supplied",
                licence_note="Licensing is the operator's responsibility.",
                requires_proxy=True,  # assume the URL may carry a credential
                offline_caching="operator_defined",
            )
    raise ProviderNotConfigured(settings.satellite_provider)


# --- Tile tokens (for the proxy) ---------------------------------------------------------


def issue_tile_token(settings: Settings, user_id: str) -> tuple[str, datetime]:
    expires = datetime.now(UTC) + timedelta(hours=settings.tile_token_hours)
    token = jwt.encode(
        {"sub": user_id, "type": "tile", "exp": int(expires.timestamp())},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    return token, expires


def verify_tile_token(settings: Settings, token: str) -> bool:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return False
    return payload.get("type") == "tile"


# --- Style -------------------------------------------------------------------------------


def build_style(provider: RasterProvider, tiles_url: str, overlays: dict | None = None) -> dict:
    """A MapLibre GL style (spec v8) with the satellite raster layer and optional overlays.

    `tiles_url` is either the provider's public template or this API's proxy URL.
    `overlays` = {"sources": {...}, "layers": [...], "metadata": [...]} appended above imagery.
    """
    style = {
        "version": 8,
        "name": f"JigMap satellite ({provider.name})",
        "metadata": {"jigmap:provider": provider.id, "jigmap:licence_status": provider.licence_status},
        "center": [MALDIVES_DEFAULT_CENTER["lon"], MALDIVES_DEFAULT_CENTER["lat"]],
        "zoom": MALDIVES_DEFAULT_ZOOM,
        "sources": {
            "satellite": {
                "type": "raster",
                "tiles": [tiles_url],
                "tileSize": provider.tile_size,
                "maxzoom": provider.max_zoom,
                "attribution": provider.attribution,
            }
        },
        "layers": [
            {"id": "background", "type": "background", "paint": {"background-color": "#06121f"}},
            {"id": "satellite", "type": "raster", "source": "satellite"},
        ],
    }
    if overlays:
        style["sources"].update(overlays["sources"])
        style["layers"].extend(overlays["layers"])
        style["metadata"]["jigmap:layers"] = overlays["metadata"]
    return style


# --- Live verification -------------------------------------------------------------------


def lonlat_to_tile(lon: float, lat: float, zoom: int) -> tuple[int, int]:
    n = 2**zoom
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n)
    return x, y


async def check_provider(provider: RasterProvider, client: httpx.AsyncClient) -> dict:
    """Fetch one real tile over Malé and report the outcome (credentials are never echoed)."""
    zoom = 10
    x, y = lonlat_to_tile(MALDIVES_DEFAULT_CENTER["lon"], MALDIVES_DEFAULT_CENTER["lat"], zoom)
    started = time.perf_counter()
    result: dict = {
        "provider": provider.id,
        "licence_status": provider.licence_status,
        "checked_at": datetime.now(UTC).isoformat(),
        "test_tile": {"z": zoom, "x": x, "y": y, "location": "Malé"},
    }
    try:
        resp = await client.get(provider.tile_url(zoom, x, y), timeout=10.0)
        content_type = resp.headers.get("content-type", "")
        ok = resp.status_code == 200 and content_type.startswith("image/") and len(resp.content) > 0
        result.update(
            reachable=ok,
            http_status=resp.status_code,
            content_type=content_type,
            bytes=len(resp.content),
            latency_ms=round((time.perf_counter() - started) * 1000),
        )
        if not ok:
            result["error"] = "Provider did not return an image tile"
    except httpx.HTTPError as exc:
        result.update(reachable=False, error=type(exc).__name__)
    return result

"""Application settings, loaded from environment variables (and an optional .env file).

Nothing secret has a usable default: the app refuses to start in production
with the development JWT secret.
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_JWT_SECRET = "dev-only-insecure-secret-change-me-0123456789abcdef"

SatelliteProvider = Literal[
    "esri_public_dev", "esri_location_platform", "mapbox_satellite", "maptiler_satellite", "custom_xyz"
]

# Providers whose terms do not cover commercial production use without an account/key.
DEV_ONLY_PROVIDERS = {"esri_public_dev"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "JigMap Maldives API"
    environment: Literal["development", "test", "production"] = "development"
    api_v1_prefix: str = "/api/v1"

    # Database (PostgreSQL + PostGIS). Uses the asyncpg driver at runtime.
    database_url: str = "postgresql+asyncpg://jigmap:jigmap@localhost:5432/jigmap"
    redis_url: str = "redis://localhost:6379/0"

    # Auth
    jwt_secret: str = DEV_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 30

    # CORS: comma separated origins, e.g. "http://localhost:8080,https://app.example.com"
    cors_origins: str = "http://localhost:8080,http://127.0.0.1:8080"

    # Satellite basemap provider (see docs/data-sources.md for licensing notes).
    satellite_provider: SatelliteProvider = "esri_public_dev"
    # Credentials stay on the server: keyed providers are served via the API tile proxy.
    esri_api_key: str | None = None
    mapbox_access_token: str | None = None
    maptiler_api_key: str | None = None
    tile_token_hours: int = 12
    custom_xyz_url: str | None = Field(
        default=None, description="XYZ raster template with {z}/{x}/{y}, used when provider=custom_xyz"
    )
    custom_xyz_attribution: str | None = None

    # Public base URL of this API, used for absolute tile URLs in map styles.
    # If unset, the request's own base URL is used.
    public_base_url: str | None = None

    # S3-compatible object storage (MinIO locally) for rasters, tiles and offline packages.
    s3_endpoint_url: str | None = "http://localhost:9000"
    s3_access_key: str = "jigmap"
    s3_secret_key: str = "jigmap-dev-secret"
    s3_bucket: str = "jigmap-data"
    s3_region: str = "us-east-1"

    # Local working directory for ingestion jobs (temporary downloads, cached grids).
    data_dir: str = ".data"  # containers set DATA_DIR=/data

    # GEBCO 2026 grid, official distribution on CEDA (zip archives of GeoTIFF tiles).
    gebco_version: str = "GEBCO_2026"
    gebco_grid_zip_url: str = "https://dap.ceda.ac.uk/bodc/gebco/global/gebco_2026/ice_surface_elevation/geotiff/gebco_2026_geotiff.zip"
    gebco_tid_zip_url: str = "https://dap.ceda.ac.uk/bodc/gebco/global/gebco_2026/type_identifier_grid/geotiff/gebco_2026_tid_geotiff.zip"

    @model_validator(mode="after")
    def _validate(self) -> "Settings":
        if self.environment == "production" and self.jwt_secret == DEV_JWT_SECRET:
            raise ValueError("JWT_SECRET must be set to a strong secret in production")
        if self.environment == "production" and self.satellite_provider in DEV_ONLY_PROVIDERS:
            raise ValueError(
                f"SATELLITE_PROVIDER={self.satellite_provider} is licensed for development only; "
                "configure a commercial provider for production"
            )
        if len(self.jwt_secret) < 32:
            raise ValueError("JWT_SECRET must be at least 32 characters")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

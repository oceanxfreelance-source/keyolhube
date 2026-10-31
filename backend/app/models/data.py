"""Provider registry, ingestion job tracking and published map layers."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class DataKind(str, enum.Enum):
    """How a dataset relates to time: keep observations, forecasts and compilations distinct."""

    observation = "observation"  # measured at a stated time
    forecast = "forecast"  # model output for a future valid time
    reanalysis = "reanalysis"
    historical_compilation = "historical_compilation"  # e.g. GEBCO: static compilation of surveys
    imagery_mosaic = "imagery_mosaic"
    derived_analysis = "derived_analysis"  # computed by JigMap from another dataset
    prediction = "prediction"


class ProviderStatus(str, enum.Enum):
    not_connected = "not_connected"
    ok = "ok"
    degraded = "degraded"
    failing = "failing"


class DataProvider(TimestampMixin, Base):
    __tablename__ = "data_providers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)  # bathymetry, imagery, ocean, weather
    homepage: Mapped[str | None] = mapped_column(String(500))
    licence: Mapped[str | None] = mapped_column(Text)
    attribution: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ProviderStatus] = mapped_column(
        Enum(ProviderStatus, name="provider_status"), default=ProviderStatus.not_connected, nullable=False
    )
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)


class JobStatus(str, enum.Enum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"


class IngestionJob(Base):
    __tablename__ = "data_ingestion_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("data_providers.id", ondelete="CASCADE"), index=True, nullable=False
    )
    job_type: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[JobStatus] = mapped_column(
        Enum(JobStatus, name="job_status"), default=JobStatus.queued, nullable=False
    )
    params: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    stats: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    log: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class MapLayer(TimestampMixin, Base):
    """A layer published to clients. Every layer carries its provenance and data kind."""

    __tablename__ = "map_layers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    layer_type: Mapped[str] = mapped_column(String(32), nullable=False)  # raster | vector | geojson
    data_kind: Mapped[DataKind] = mapped_column(Enum(DataKind, name="data_kind"), nullable=False)
    provider_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("data_providers.id", ondelete="SET NULL")
    )
    dataset_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    min_zoom: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_zoom: Mapped[int] = mapped_column(Integer, default=22, nullable=False)
    attribution: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    default_visible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    default_opacity: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    data_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

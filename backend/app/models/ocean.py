"""Ocean observations (with their observation time) and fishing predictions (clearly separate)."""

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class OceanObservation(Base):
    """One published gridded ocean field (e.g. SST for one day), with provenance."""

    __tablename__ = "ocean_observations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("data_providers.id", ondelete="RESTRICT"), nullable=False
    )
    job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("data_ingestion_jobs.id", ondelete="SET NULL")
    )
    variable: Mapped[str] = mapped_column(String(32), index=True, nullable=False)  # sst | chl | sst_front
    units: Mapped[str] = mapped_column(String(32), nullable=False)
    data_kind: Mapped[str] = mapped_column(String(32), nullable=False)  # observation | derived_analysis
    product: Mapped[str] = mapped_column(Text, nullable=False)
    product_level: Mapped[str] = mapped_column(Text, nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    resolution_deg: Mapped[float] = mapped_column(Float, nullable=False)
    bounds: Mapped[list] = mapped_column(JSONB, nullable=False)
    stats: Mapped[dict] = mapped_column(JSONB, nullable=False)
    grid_key: Mapped[str] = mapped_column(String(300), nullable=False)
    tiles_prefix: Mapped[str] = mapped_column(String(300), nullable=False)
    tile_count: Mapped[int] = mapped_column(Integer, nullable=False)
    is_latest: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class FishingPrediction(Base):
    """A computed suitability layer (prediction). Inputs and weights are stored for transparency."""

    __tablename__ = "fishing_predictions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model: Mapped[str] = mapped_column(String(64), index=True, nullable=False)  # tuna_habitat | jigging_zones
    model_version: Mapped[str] = mapped_column(String(32), nullable=False)
    valid_for: Mapped[date] = mapped_column(Date, nullable=False)
    inputs: Mapped[dict] = mapped_column(JSONB, nullable=False)  # input layers with their times
    params: Mapped[dict] = mapped_column(JSONB, nullable=False)  # factor definitions and weights
    stats: Mapped[dict] = mapped_column(JSONB, nullable=False)
    validation: Mapped[dict] = mapped_column(JSONB, nullable=False)  # against catch records (none yet)
    grid_key: Mapped[str] = mapped_column(String(300), nullable=False)
    tiles_prefix: Mapped[str] = mapped_column(String(300), nullable=False)
    tile_count: Mapped[int] = mapped_column(Integer, nullable=False)
    is_latest: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

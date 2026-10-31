import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ImageryMosaic(Base):
    """A self-built satellite imagery mosaic (e.g. cloud-free Sentinel-2), served as tiles."""

    __tablename__ = "imagery_mosaics"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("data_providers.id", ondelete="RESTRICT"), nullable=False
    )
    job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("data_ingestion_jobs.id", ondelete="SET NULL")
    )
    source: Mapped[str] = mapped_column(Text, nullable=False)
    attribution: Mapped[str] = mapped_column(Text, nullable=False)
    acquired_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    acquired_to: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    scene_count: Mapped[int] = mapped_column(Integer, nullable=False)
    scene_ids: Mapped[list] = mapped_column(JSONB, nullable=False)
    chunk_count: Mapped[int] = mapped_column(Integer, nullable=False)
    tile_count: Mapped[int] = mapped_column(Integer, nullable=False)
    min_zoom: Mapped[int] = mapped_column(Integer, nullable=False)
    max_zoom: Mapped[int] = mapped_column(Integer, nullable=False)
    bounds: Mapped[list] = mapped_column(JSONB, nullable=False)  # [west, south, east, north]
    tiles_prefix: Mapped[str] = mapped_column(String(300), nullable=False)
    params: Mapped[dict] = mapped_column(JSONB, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

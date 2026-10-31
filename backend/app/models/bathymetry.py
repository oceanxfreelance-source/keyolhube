"""GEBCO-derived bathymetry: dataset provenance, contours and terrain-feature candidates.

Geometries use geometry(…, 4326) rather than geography so that vector tiles can be
built with ST_AsMVT/ST_Transform directly; all are GiST-indexed.
"""

import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class BathymetryDataset(Base):
    __tablename__ = "bathymetry_metadata"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("data_providers.id", ondelete="RESTRICT"), nullable=False
    )
    job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("data_ingestion_jobs.id", ondelete="SET NULL")
    )
    version: Mapped[str] = mapped_column(String(32), nullable=False)  # e.g. GEBCO_2026
    citation: Mapped[str] = mapped_column(Text, nullable=False)
    source_urls: Mapped[dict] = mapped_column(JSONB, nullable=False)
    source_last_modified: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source_checksums: Mapped[dict] = mapped_column(JSONB, nullable=False)  # member -> crc32
    bounds = mapped_column(Geometry("POLYGON", srid=4326), nullable=False)
    resolution_arcsec: Mapped[float] = mapped_column(Float, nullable=False)
    resolution_m_approx: Mapped[float] = mapped_column(Float, nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    min_elevation_m: Mapped[float] = mapped_column(Float, nullable=False)
    max_elevation_m: Mapped[float] = mapped_column(Float, nullable=False)
    nodata_cells: Mapped[int] = mapped_column(BigInteger, nullable=False)
    tid_summary: Mapped[dict] = mapped_column(JSONB, nullable=False)  # code -> cell count
    grid_key: Mapped[str] = mapped_column(String(300), nullable=False)  # S3 key of elevation GeoTIFF
    tid_key: Mapped[str] = mapped_column(String(300), nullable=False)
    tiles_prefix: Mapped[str] = mapped_column(String(300), nullable=False)
    contour_levels_m: Mapped[list] = mapped_column(JSONB, nullable=False)
    analysis_params: Mapped[dict] = mapped_column(JSONB, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class BathymetryContour(Base):
    __tablename__ = "bathymetry_contours"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("bathymetry_metadata.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    depth_m: Mapped[int] = mapped_column(Integer, nullable=False)  # positive down
    geom = mapped_column(Geometry("LINESTRING", srid=4326, spatial_index=True), nullable=False)


class BathymetryFeature(Base):
    """Candidate terrain features computed from the grid (never verified structures)."""

    __tablename__ = "bathymetry_features"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("bathymetry_metadata.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)  # drop_off | pinnacle | knoll | seamount
    geom = mapped_column(Geometry("POINT", srid=4326, spatial_index=True), nullable=False)
    depth_m: Mapped[float] = mapped_column(Float, nullable=False)  # positive down, at the point
    relief_m: Mapped[float | None] = mapped_column(Float)
    max_slope_deg: Mapped[float | None] = mapped_column(Float)
    depth_range_m: Mapped[list | None] = mapped_column(JSONB)
    source_tid: Mapped[int | None] = mapped_column(Integer)
    properties: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)

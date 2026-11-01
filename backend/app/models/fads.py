import uuid
from datetime import date, datetime

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class FadList(Base):
    """One official FAD position list (PDF) from the Ministry of Fisheries."""

    __tablename__ = "fad_lists"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    list_type: Mapped[str] = mapped_column(String(32), nullable=False)  # pole_and_line | sport
    title: Mapped[str] = mapped_column(Text, nullable=False)  # as published, includes the list date
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False)
    is_latest: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class FadPosition(Base):
    __tablename__ = "fad_positions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    list_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fad_lists.id", ondelete="CASCADE"), index=True, nullable=False
    )
    row_no: Mapped[int] = mapped_column(Integer, nullable=False)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)  # in_place | broken_away | unknown
    geom = mapped_column(Geometry("POINT", srid=4326, spatial_index=True), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    raw_lat: Mapped[str] = mapped_column(String(64), nullable=False)  # exactly as printed
    raw_lon: Mapped[str] = mapped_column(String(64), nullable=False)
    deployed_on: Mapped[date | None] = mapped_column(Date)
    listed_distance_nm: Mapped[float | None] = mapped_column(Float)
    grid_depth_m: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

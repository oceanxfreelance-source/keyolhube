"""Ocean observations (NOAA CoastWatch) and fishing predictions.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-31
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TS = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "ocean_observations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("provider_id", sa.UUID(), nullable=False),
        sa.Column("job_id", sa.UUID()),
        sa.Column("variable", sa.String(32), nullable=False),
        sa.Column("units", sa.String(32), nullable=False),
        sa.Column("data_kind", sa.String(32), nullable=False),
        sa.Column("product", sa.Text(), nullable=False),
        sa.Column("product_level", sa.Text(), nullable=False),
        sa.Column("observed_at", TS, nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("resolution_deg", sa.Float(), nullable=False),
        sa.Column("bounds", JSONB, nullable=False),
        sa.Column("stats", JSONB, nullable=False),
        sa.Column("grid_key", sa.String(300), nullable=False),
        sa.Column("tiles_prefix", sa.String(300), nullable=False),
        sa.Column("tile_count", sa.Integer(), nullable=False),
        sa.Column("is_latest", sa.Boolean(), nullable=False),
        sa.Column("created_at", TS, server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_ocean_observations"),
        sa.ForeignKeyConstraint(["provider_id"], ["data_providers.id"],
                                name="fk_ocean_observations_provider_id_data_providers", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["job_id"], ["data_ingestion_jobs.id"],
                                name="fk_ocean_observations_job_id_data_ingestion_jobs", ondelete="SET NULL"),
    )
    op.create_index("ix_ocean_observations_variable", "ocean_observations", ["variable"])
    op.create_index("uq_ocean_observations_latest", "ocean_observations", ["variable"], unique=True,
                    postgresql_where=sa.text("is_latest"))
    op.create_table(
        "fishing_predictions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("model", sa.String(64), nullable=False),
        sa.Column("model_version", sa.String(32), nullable=False),
        sa.Column("valid_for", sa.Date(), nullable=False),
        sa.Column("inputs", JSONB, nullable=False),
        sa.Column("params", JSONB, nullable=False),
        sa.Column("stats", JSONB, nullable=False),
        sa.Column("validation", JSONB, nullable=False),
        sa.Column("grid_key", sa.String(300), nullable=False),
        sa.Column("tiles_prefix", sa.String(300), nullable=False),
        sa.Column("tile_count", sa.Integer(), nullable=False),
        sa.Column("is_latest", sa.Boolean(), nullable=False),
        sa.Column("created_at", TS, server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_fishing_predictions"),
    )
    op.create_index("ix_fishing_predictions_model", "fishing_predictions", ["model"])
    op.create_index("uq_fishing_predictions_latest", "fishing_predictions", ["model"], unique=True,
                    postgresql_where=sa.text("is_latest"))
    op.execute("""
        INSERT INTO data_providers (id, slug, name, category, homepage, licence, attribution, status)
        VALUES (gen_random_uuid(), 'noaa_coastwatch', 'NOAA CoastWatch ERDDAP (MUR SST, VIIRS chlorophyll)', 'ocean',
                'https://coastwatch.noaa.gov/erddap/',
                'Free of charge; may be used and redistributed (NASA/NOAA data policies). Not for legal use.',
                'SST: JPL MUR v4.1 (NASA). Chlorophyll: NOAA STAR / CoastWatch (S-NPP VIIRS).', 'not_connected')
    """)


def downgrade() -> None:
    op.execute("DELETE FROM data_providers WHERE slug = 'noaa_coastwatch'")
    op.drop_table("fishing_predictions")
    op.drop_table("ocean_observations")

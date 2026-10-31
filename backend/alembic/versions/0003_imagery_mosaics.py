"""Self-built imagery mosaics (Sentinel-2) and provider registration.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-31
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TS = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "imagery_mosaics",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("provider_id", sa.UUID(), nullable=False),
        sa.Column("job_id", sa.UUID()),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("attribution", sa.Text(), nullable=False),
        sa.Column("acquired_from", TS, nullable=False),
        sa.Column("acquired_to", TS, nullable=False),
        sa.Column("scene_count", sa.Integer(), nullable=False),
        sa.Column("scene_ids", JSONB, nullable=False),
        sa.Column("chunk_count", sa.Integer(), nullable=False),
        sa.Column("tile_count", sa.Integer(), nullable=False),
        sa.Column("min_zoom", sa.Integer(), nullable=False),
        sa.Column("max_zoom", sa.Integer(), nullable=False),
        sa.Column("bounds", JSONB, nullable=False),
        sa.Column("tiles_prefix", sa.String(300), nullable=False),
        sa.Column("params", JSONB, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", TS, server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_imagery_mosaics"),
        sa.ForeignKeyConstraint(["provider_id"], ["data_providers.id"],
                                name="fk_imagery_mosaics_provider_id_data_providers", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["job_id"], ["data_ingestion_jobs.id"],
                                name="fk_imagery_mosaics_job_id_data_ingestion_jobs", ondelete="SET NULL"),
    )
    op.create_index("uq_imagery_mosaics_active", "imagery_mosaics", ["is_active"], unique=True,
                    postgresql_where=sa.text("is_active"))
    op.execute("""
        INSERT INTO data_providers (id, slug, name, category, homepage, licence, attribution, status)
        VALUES (gen_random_uuid(), 'sentinel2', 'Copernicus Sentinel-2 L2A (AWS Open Data)', 'imagery',
                'https://registry.opendata.aws/sentinel-2-l2a-cogs/',
                'Copernicus Sentinel data: free and open, including commercial use and redistribution, with attribution.',
                'Contains modified Copernicus Sentinel data', 'not_connected')
    """)


def downgrade() -> None:
    op.execute("DELETE FROM data_providers WHERE slug = 'sentinel2'")
    op.drop_table("imagery_mosaics")

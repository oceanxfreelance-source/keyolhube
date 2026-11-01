"""Official FAD positions (Ministry of Fisheries lists).

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-01
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "fad_lists",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("list_type", sa.String(32), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("row_count", sa.Integer(), nullable=False),
        sa.Column("is_latest", sa.Boolean(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_fad_lists"),
    )
    op.create_index("uq_fad_lists_latest", "fad_lists", ["list_type"], unique=True,
                    postgresql_where=sa.text("is_latest"))
    op.create_table(
        "fad_positions",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("list_id", sa.UUID(), nullable=False),
        sa.Column("row_no", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("geom", Geometry("POINT", srid=4326, spatial_index=False), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lon", sa.Float(), nullable=False),
        sa.Column("raw_lat", sa.String(64), nullable=False),
        sa.Column("raw_lon", sa.String(64), nullable=False),
        sa.Column("deployed_on", sa.Date()),
        sa.Column("listed_distance_nm", sa.Float()),
        sa.Column("grid_depth_m", sa.Float()),
        sa.Column("notes", JSONB, nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_fad_positions"),
        sa.ForeignKeyConstraint(["list_id"], ["fad_lists.id"], name="fk_fad_positions_list_id_fad_lists",
                                ondelete="CASCADE"),
    )
    op.create_index("ix_fad_positions_list_id", "fad_positions", ["list_id"])
    op.create_index("ix_fad_positions_geom", "fad_positions", ["geom"], postgresql_using="gist")
    op.execute("""
        INSERT INTO data_providers (id, slug, name, category, homepage, licence, attribution, status)
        VALUES (gen_random_uuid(), 'mv_fisheries_fads', 'Ministry of Fisheries and Ocean Resources: FAD position lists',
                'fishing', 'https://fisheries.gov.mv/fad', 'Published by the Government of Maldives.',
                'FAD positions: Ministry of Fisheries and Ocean Resources, Maldives', 'not_connected')
    """)


def downgrade() -> None:
    op.execute("DELETE FROM data_providers WHERE slug = 'mv_fisheries_fads'")
    op.drop_table("fad_positions")
    op.drop_table("fad_lists")

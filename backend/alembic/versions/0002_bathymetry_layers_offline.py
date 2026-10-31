"""Data providers, ingestion jobs, map layers, GEBCO bathymetry and offline packages.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-31
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = sa.UUID()
TS = sa.DateTime(timezone=True)


def _ts_cols():
    return [
        sa.Column("created_at", TS, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", TS, server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    bind = op.get_bind()
    provider_status = postgresql.ENUM("not_connected", "ok", "degraded", "failing", name="provider_status")
    job_status = postgresql.ENUM("queued", "running", "succeeded", "failed", name="job_status")
    data_kind = postgresql.ENUM(
        "observation", "forecast", "reanalysis", "historical_compilation", "imagery_mosaic",
        "derived_analysis", "prediction", name="data_kind",
    )
    for e in (provider_status, job_status, data_kind):
        e.create(bind, checkfirst=True)

    op.create_table(
        "data_providers",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("slug", sa.String(64), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("homepage", sa.String(500)),
        sa.Column("licence", sa.Text()),
        sa.Column("attribution", sa.Text()),
        sa.Column("status", postgresql.ENUM(name="provider_status", create_type=False), nullable=False),
        sa.Column("last_checked_at", TS),
        sa.Column("last_success_at", TS),
        sa.Column("last_error", sa.Text()),
        *_ts_cols(),
        sa.PrimaryKeyConstraint("id", name="pk_data_providers"),
        sa.UniqueConstraint("slug", name="uq_data_providers_slug"),
    )

    op.create_table(
        "data_ingestion_jobs",
        sa.Column("id", UUID, nullable=False),
        sa.Column("provider_id", UUID, nullable=False),
        sa.Column("job_type", sa.String(64), nullable=False),
        sa.Column("status", postgresql.ENUM(name="job_status", create_type=False), nullable=False),
        sa.Column("params", JSONB, nullable=False),
        sa.Column("stats", JSONB, nullable=False),
        sa.Column("log", JSONB, nullable=False),
        sa.Column("error", sa.Text()),
        sa.Column("created_at", TS, server_default=sa.func.now(), nullable=False),
        sa.Column("started_at", TS),
        sa.Column("finished_at", TS),
        sa.PrimaryKeyConstraint("id", name="pk_data_ingestion_jobs"),
        sa.ForeignKeyConstraint(["provider_id"], ["data_providers.id"],
                                name="fk_data_ingestion_jobs_provider_id_data_providers", ondelete="CASCADE"),
    )
    op.create_index("ix_data_ingestion_jobs_provider_id", "data_ingestion_jobs", ["provider_id"])

    op.create_table(
        "map_layers",
        sa.Column("id", UUID, nullable=False),
        sa.Column("slug", sa.String(64), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("layer_type", sa.String(32), nullable=False),
        sa.Column("data_kind", postgresql.ENUM(name="data_kind", create_type=False), nullable=False),
        sa.Column("provider_id", UUID),
        sa.Column("dataset_id", UUID),
        sa.Column("min_zoom", sa.Integer(), nullable=False),
        sa.Column("max_zoom", sa.Integer(), nullable=False),
        sa.Column("attribution", sa.Text()),
        sa.Column("description", sa.Text()),
        sa.Column("default_visible", sa.Boolean(), nullable=False),
        sa.Column("default_opacity", sa.Float(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("data_updated_at", TS),
        *_ts_cols(),
        sa.PrimaryKeyConstraint("id", name="pk_map_layers"),
        sa.UniqueConstraint("slug", name="uq_map_layers_slug"),
        sa.ForeignKeyConstraint(["provider_id"], ["data_providers.id"],
                                name="fk_map_layers_provider_id_data_providers", ondelete="SET NULL"),
    )

    op.create_table(
        "bathymetry_metadata",
        sa.Column("id", UUID, nullable=False),
        sa.Column("provider_id", UUID, nullable=False),
        sa.Column("job_id", UUID),
        sa.Column("version", sa.String(32), nullable=False),
        sa.Column("citation", sa.Text(), nullable=False),
        sa.Column("source_urls", JSONB, nullable=False),
        sa.Column("source_last_modified", TS),
        sa.Column("source_checksums", JSONB, nullable=False),
        sa.Column("bounds", Geometry("POLYGON", srid=4326, spatial_index=False), nullable=False),
        sa.Column("resolution_arcsec", sa.Float(), nullable=False),
        sa.Column("resolution_m_approx", sa.Float(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("min_elevation_m", sa.Float(), nullable=False),
        sa.Column("max_elevation_m", sa.Float(), nullable=False),
        sa.Column("nodata_cells", sa.BigInteger(), nullable=False),
        sa.Column("tid_summary", JSONB, nullable=False),
        sa.Column("grid_key", sa.String(300), nullable=False),
        sa.Column("tid_key", sa.String(300), nullable=False),
        sa.Column("tiles_prefix", sa.String(300), nullable=False),
        sa.Column("contour_levels_m", JSONB, nullable=False),
        sa.Column("analysis_params", JSONB, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("ingested_at", TS, server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_bathymetry_metadata"),
        sa.ForeignKeyConstraint(["provider_id"], ["data_providers.id"],
                                name="fk_bathymetry_metadata_provider_id_data_providers", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["job_id"], ["data_ingestion_jobs.id"],
                                name="fk_bathymetry_metadata_job_id_data_ingestion_jobs", ondelete="SET NULL"),
    )
    op.create_index("ix_bathymetry_metadata_bounds", "bathymetry_metadata", ["bounds"], postgresql_using="gist")
    # At most one active dataset.
    op.create_index("uq_bathymetry_metadata_active", "bathymetry_metadata", ["is_active"], unique=True,
                    postgresql_where=sa.text("is_active"))

    op.create_table(
        "bathymetry_contours",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("dataset_id", UUID, nullable=False),
        sa.Column("depth_m", sa.Integer(), nullable=False),
        sa.Column("geom", Geometry("LINESTRING", srid=4326, spatial_index=False), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_bathymetry_contours"),
        sa.ForeignKeyConstraint(["dataset_id"], ["bathymetry_metadata.id"],
                                name="fk_bathymetry_contours_dataset_id_bathymetry_metadata", ondelete="CASCADE"),
    )
    op.create_index("ix_bathymetry_contours_dataset_id", "bathymetry_contours", ["dataset_id"])
    op.create_index("ix_bathymetry_contours_geom", "bathymetry_contours", ["geom"], postgresql_using="gist")

    op.create_table(
        "bathymetry_features",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("dataset_id", UUID, nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("geom", Geometry("POINT", srid=4326, spatial_index=False), nullable=False),
        sa.Column("depth_m", sa.Float(), nullable=False),
        sa.Column("relief_m", sa.Float()),
        sa.Column("max_slope_deg", sa.Float()),
        sa.Column("depth_range_m", JSONB),
        sa.Column("source_tid", sa.Integer()),
        sa.Column("properties", JSONB, nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_bathymetry_features"),
        sa.ForeignKeyConstraint(["dataset_id"], ["bathymetry_metadata.id"],
                                name="fk_bathymetry_features_dataset_id_bathymetry_metadata", ondelete="CASCADE"),
    )
    op.create_index("ix_bathymetry_features_dataset_id", "bathymetry_features", ["dataset_id"])
    op.create_index("ix_bathymetry_features_geom", "bathymetry_features", ["geom"], postgresql_using="gist")
    op.create_index("ix_bathymetry_features_kind", "bathymetry_features", ["kind"])

    op.create_table(
        "offline_packages",
        sa.Column("id", UUID, nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("dataset_id", UUID),
        sa.Column("bounds", Geometry("POLYGON", srid=4326, spatial_index=False), nullable=False),
        sa.Column("s3_key", sa.String(300), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("contents", JSONB, nullable=False),
        sa.Column("data_updated_at", TS, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", TS, server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_offline_packages"),
        sa.UniqueConstraint("slug", name="uq_offline_packages_slug"),
        sa.ForeignKeyConstraint(["dataset_id"], ["bathymetry_metadata.id"],
                                name="fk_offline_packages_dataset_id_bathymetry_metadata", ondelete="CASCADE"),
    )
    op.create_index("ix_offline_packages_bounds", "offline_packages", ["bounds"], postgresql_using="gist")

    op.create_table(
        "offline_downloads",
        sa.Column("id", UUID, nullable=False),
        sa.Column("user_id", UUID, nullable=False),
        sa.Column("package_id", UUID, nullable=False),
        sa.Column("package_sha256", sa.String(64), nullable=False),
        sa.Column("downloaded_at", TS, server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_offline_downloads"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_offline_downloads_user_id_users",
                                ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["package_id"], ["offline_packages.id"],
                                name="fk_offline_downloads_package_id_offline_packages", ondelete="CASCADE"),
    )
    op.create_index("ix_offline_downloads_user_id", "offline_downloads", ["user_id"])
    op.create_index("ix_offline_downloads_package_id", "offline_downloads", ["package_id"])

    # Provider registry. Status reflects reality: only GEBCO and imagery are wired up so far.
    op.execute("""
        INSERT INTO data_providers (id, slug, name, category, homepage, licence, attribution, status)
        VALUES
        (gen_random_uuid(), 'gebco', 'GEBCO Gridded Bathymetry (via CEDA)', 'bathymetry',
         'https://www.gebco.net/',
         'Public domain; commercial use permitted with attribution. NOT for navigation.',
         'GEBCO Compilation Group (2026) GEBCO 2026 Grid (doi:10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa)',
         'not_connected'),
        (gen_random_uuid(), 'satellite_imagery', 'Satellite basemap (configured provider)', 'imagery',
         NULL, 'See docs/data-sources.md', NULL, 'not_connected'),
        (gen_random_uuid(), 'copernicus_marine', 'Copernicus Marine Service', 'ocean',
         'https://marine.copernicus.eu/', NULL, NULL, 'not_connected'),
        (gen_random_uuid(), 'marine_weather', 'Marine weather (provider not yet selected)', 'weather',
         NULL, NULL, NULL, 'not_connected')
    """)


def downgrade() -> None:
    for t in ["offline_downloads", "offline_packages", "bathymetry_features", "bathymetry_contours",
              "bathymetry_metadata", "map_layers", "data_ingestion_jobs", "data_providers"]:
        op.drop_table(t)
    for e in ["data_kind", "job_status", "provider_status"]:
        postgresql.ENUM(name=e).drop(op.get_bind(), checkfirst=True)

from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, Response, status
from geoalchemy2.functions import ST_X, ST_Y, ST_AsGeoJSON, ST_Intersects, ST_MakeEnvelope
from sqlalchemy import func, select

from app.api.deps import DbSession
from app.ingestion.analysis import TID_LABELS
from app.models import BathymetryDataset, BathymetryFeature
from app.services import bathymetry as svc

router = APIRouter(prefix="/bathymetry", tags=["bathymetry"])

TILE_CACHE = "public, max-age=86400"


async def _active_or_503(db) -> BathymetryDataset:
    ds = await svc.active_dataset(db)
    if ds is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Bathymetry not ingested yet")
    return ds


def dataset_summary(ds: BathymetryDataset, bounds_geojson: str | None = None) -> dict:
    return {
        "id": str(ds.id),
        "version": ds.version,
        "citation": ds.citation,
        "data_kind": "historical_compilation",
        "source_urls": ds.source_urls,
        "source_last_modified": ds.source_last_modified.isoformat() if ds.source_last_modified else None,
        "ingested_at": ds.ingested_at.isoformat(),
        "source_checksums_crc32": ds.source_checksums,
        "resolution": {"arcsec": ds.resolution_arcsec, "metres_approx": ds.resolution_m_approx},
        "grid": {"width": ds.width, "height": ds.height},
        "elevation_range_m": [ds.min_elevation_m, ds.max_elevation_m],
        "source_types": {
            code: {"cells": n, "label": TID_LABELS.get(int(code), f"TID {code}")}
            for code, n in ds.tid_summary.items()
        },
        "contour_levels_m": ds.contour_levels_m,
        "analysis_params": ds.analysis_params,
        "disclaimer": svc.DISCLAIMER,
    }


@router.get("/datasets/active", summary="Active bathymetry dataset with full provenance")
async def active(db: DbSession) -> dict:
    return dataset_summary(await _active_or_503(db))


@router.get("/depth", summary="Grid depth at a point (not for navigation)")
async def depth(
    db: DbSession,
    lat: Annotated[float, Query(ge=-90, le=90)],
    lon: Annotated[float, Query(ge=-180, le=180)],
) -> dict:
    ds = await _active_or_503(db)
    loaded = await svc.load_grid(ds)
    sample = svc.depth_at(loaded, lat, lon)
    if sample is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Point is outside the bathymetry coverage")
    return {
        "query": {"lat": lat, "lon": lon},
        **sample,
        "dataset": {
            "id": str(ds.id),
            "version": ds.version,
            "citation": ds.citation,
            "source_last_modified": ds.source_last_modified.isoformat() if ds.source_last_modified else None,
        },
        "data_kind": "historical_compilation",
        "not_for_navigation": True,
        "disclaimer": svc.DISCLAIMER,
    }


@router.get("/contours/{z}/{x}/{y}.pbf", summary="Isobath vector tiles (MVT, layer 'contours')")
async def contours(db: DbSession, z: int, x: int, y: int) -> Response:
    if not (0 <= z <= 22 and 0 <= x < 2**z and 0 <= y < 2**z):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tile out of range")
    ds = await _active_or_503(db)
    data = await svc.contour_tile(db, ds.id, z, x, y)
    if not data:
        return Response(status_code=204, headers={"Cache-Control": TILE_CACHE})
    return Response(
        data,
        media_type="application/vnd.mapbox-vector-tile",
        headers={"Cache-Control": TILE_CACHE, "ETag": f'"{ds.id}-{z}-{x}-{y}"'},
    )


@router.get("/tiles/{layer}/{z}/{x}/{y}.png", summary="Depth-shading or slope raster tiles")
async def raster(db: DbSession, layer: Literal["depth", "slope"], z: int, x: int, y: int) -> Response:
    ds = await _active_or_503(db)
    data = await svc.raster_tile(ds, layer, z, x, y)
    if data is None:
        return Response(status_code=204, headers={"Cache-Control": TILE_CACHE})
    return Response(data, media_type="image/png", headers={"Cache-Control": TILE_CACHE})


FEATURE_KINDS = Literal["drop_off", "pinnacle", "knoll", "seamount"]


@router.get("/features.geojson", summary="Compact candidate features for map display")
async def features_geojson(
    db: DbSession,
    kind: Annotated[list[FEATURE_KINDS] | None, Query()] = None,
    bbox: Annotated[str | None, Query(description="west,south,east,north")] = None,
    limit: Annotated[int, Query(ge=1, le=20000)] = 20000,
) -> Response:
    ds = await _active_or_503(db)
    q = select(
        BathymetryFeature.id,
        BathymetryFeature.kind,
        BathymetryFeature.depth_m,
        BathymetryFeature.relief_m,
        BathymetryFeature.max_slope_deg,
        ST_X(BathymetryFeature.geom),
        ST_Y(BathymetryFeature.geom),
    ).where(BathymetryFeature.dataset_id == ds.id)
    if kind:
        q = q.where(BathymetryFeature.kind.in_(kind))
    if bbox:
        try:
            w, s, e, n = (float(v) for v in bbox.split(","))
        except ValueError:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "bbox must be west,south,east,north"
            ) from None
        q = q.where(ST_Intersects(BathymetryFeature.geom, ST_MakeEnvelope(w, s, e, n, 4326)))
    rows = (await db.execute(q.order_by(BathymetryFeature.id).limit(limit))).all()
    import json

    fc = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": r[0],
                "properties": {
                    "id": r[0],
                    "kind": r[1],
                    "depth_m": r[2],
                    "relief_m": r[3],
                    "max_slope_deg": r[4],
                },
                "geometry": {"type": "Point", "coordinates": [round(r[5], 6), round(r[6], 6)]},
            }
            for r in rows
        ],
    }
    return Response(
        json.dumps(fc, separators=(",", ":")),
        media_type="application/geo+json",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get("/features/{feature_id}", summary="One candidate feature with its explanation")
async def feature(db: DbSession, feature_id: int) -> dict:
    ds = await _active_or_503(db)
    row = (
        await db.execute(
            select(BathymetryFeature, ST_AsGeoJSON(BathymetryFeature.geom)).where(
                BathymetryFeature.id == feature_id, BathymetryFeature.dataset_id == ds.id
            )
        )
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Feature not found")
    f, geom = row
    import json

    return {
        "id": f.id,
        "kind": f.kind,
        "geometry": json.loads(geom),
        "depth_m": f.depth_m,
        "relief_m": f.relief_m,
        "max_slope_deg": f.max_slope_deg,
        "depth_range_m": f.depth_range_m,
        "source": {"tid": f.source_tid, "label": TID_LABELS.get(f.source_tid or -1)}
        if f.source_tid is not None
        else None,
        "explanation": f.explanation,
        "properties": f.properties,
        "data_kind": "derived_analysis",
        "is_candidate": True,
        "dataset_version": ds.version,
        "disclaimer": svc.DISCLAIMER,
    }


@router.get("/features/stats/summary", summary="Counts of candidate features by kind")
async def feature_stats(db: DbSession) -> dict:
    ds = await _active_or_503(db)
    rows = (
        await db.execute(
            select(BathymetryFeature.kind, func.count())
            .where(BathymetryFeature.dataset_id == ds.id)
            .group_by(BathymetryFeature.kind)
        )
    ).all()
    return {"dataset_id": str(ds.id), "counts": {k: n for k, n in rows}}

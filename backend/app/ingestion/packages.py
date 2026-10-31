"""Offline bathymetry packages (format version 1).

A package is a ZIP containing:
  manifest.json      provenance, licence, disclaimer, grid geometry, per-file SHA-256
  elevation.i16      int16 little-endian, metres positive up, row-major, row 0 = north
  tid.u8             GEBCO Type Identifier per cell
  contours.geojson   isobaths clipped to the package bounds (depth_m positive down)
  features.geojson   drop-off / rise candidates with explanations
"""

import hashlib
import json
import os
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime

import numpy as np
from shapely.geometry import LineString, MultiLineString
from shapely.ops import clip_by_rect

from app.ingestion.analysis import TID_LABELS, ContourLine, FeatureCandidate, Grid

FORMAT_VERSION = 1
DISCLAIMER = (
    "GEBCO bathymetry is a regional-scale (~460 m) interpolated compilation. It is NOT a nautical "
    "chart and must not be used for navigation or to judge safe clearance. Drop-off and rise "
    "features are computed candidates, not verified structures."
)


@dataclass(frozen=True)
class Region:
    slug: str
    name: str
    bounds: dict


REGIONS = [
    Region(
        "maldives-north",
        "Northern Maldives (5.0°N – 8.5°N)",
        {"west": 70.0, "south": 5.0, "east": 77.5, "north": 8.5},
    ),
    Region(
        "maldives-central",
        "Central Maldives (1.5°N – 5.0°N)",
        {"west": 70.0, "south": 1.5, "east": 77.5, "north": 5.0},
    ),
    Region(
        "maldives-south",
        "Southern Maldives (3.5°S – 1.5°N)",
        {"west": 70.0, "south": -3.5, "east": 77.5, "north": 1.5},
    ),
]


@dataclass
class BuiltPackage:
    path: str
    s3_key: str
    size_bytes: int
    sha256: str
    contents: dict


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def subset(grid: Grid, tid: np.ndarray, b: dict) -> tuple[np.ndarray, np.ndarray]:
    r0 = round((grid.north - b["north"]) / grid.res_deg)
    r1 = round((grid.north - b["south"]) / grid.res_deg)
    c0 = round((b["west"] - grid.west) / grid.res_deg)
    c1 = round((b["east"] - grid.west) / grid.res_deg)
    if r0 < 0 or c0 < 0 or r1 > grid.height or c1 > grid.width:
        raise ValueError("region outside grid")
    return grid.elevation[r0:r1, c0:c1], tid[r0:r1, c0:c1]


def contours_geojson(lines: list[ContourLine], b: dict) -> dict:
    feats = []
    for ln in lines:
        clipped = clip_by_rect(LineString(ln.coords), b["west"], b["south"], b["east"], b["north"])
        if clipped.is_empty:
            continue
        parts = clipped.geoms if isinstance(clipped, MultiLineString) else [clipped]
        for part in parts:
            if isinstance(part, LineString) and len(part.coords) >= 2:
                feats.append(
                    {
                        "type": "Feature",
                        "properties": {"depth_m": ln.depth_m},
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [[round(x, 5), round(y, 5)] for x, y in part.coords],
                        },
                    }
                )
    return {"type": "FeatureCollection", "features": feats}


def features_geojson(features: list[FeatureCandidate], b: dict) -> dict:
    out = []
    for f in features:
        if b["west"] <= f.lon < b["east"] and b["south"] <= f.lat < b["north"]:
            out.append(
                {
                    "type": "Feature",
                    "properties": {
                        "kind": f.kind,
                        "depth_m": f.depth_m,
                        "relief_m": f.relief_m,
                        "max_slope_deg": f.max_slope_deg,
                        "depth_range_m": list(f.depth_range_m) if f.depth_range_m else None,
                        "source_tid": f.source_tid,
                        "explanation": f.explanation,
                    },
                    "geometry": {"type": "Point", "coordinates": [round(f.lon, 6), round(f.lat, 6)]},
                }
            )
    return {"type": "FeatureCollection", "features": out}


def build_package(
    region: Region, ds, grid: Grid, tid: np.ndarray, lines, features, workdir: str
) -> BuiltPackage:
    elev, t = subset(grid, tid, region.bounds)
    files = {
        "elevation.i16": np.ascontiguousarray(elev.astype("<i2")).tobytes(),
        "tid.u8": np.ascontiguousarray(t.astype(np.uint8)).tobytes(),
        "contours.geojson": json.dumps(
            contours_geojson(lines, region.bounds), separators=(",", ":")
        ).encode(),
        "features.geojson": json.dumps(
            features_geojson(features, region.bounds), separators=(",", ":")
        ).encode(),
    }
    manifest = {
        "format_version": FORMAT_VERSION,
        "kind": "bathymetry",
        "region": {"slug": region.slug, "name": region.name, "bounds": region.bounds},
        "dataset": {
            "id": str(ds.id),
            "version": ds.version,
            "citation": ds.citation,
            "licence": "GEBCO Grid: public domain, attribution required. Not for navigation.",
            "data_kind": "historical_compilation",
            "source_last_modified": ds.source_last_modified.isoformat() if ds.source_last_modified else None,
            "resolution_arcsec": 15.0,
            "resolution_m_approx": ds.resolution_m_approx,
        },
        "generated_at": datetime.now(UTC).isoformat(),
        "disclaimer": DISCLAIMER,
        "grid": {
            "file": "elevation.i16",
            "tid_file": "tid.u8",
            "dtype": "int16_le",
            "units": "m_positive_up",
            "width": int(elev.shape[1]),
            "height": int(elev.shape[0]),
            "west": region.bounds["west"],
            "north": region.bounds["north"],
            "res_deg": grid.res_deg,
            "registration": "pixel_centre",
        },
        "tid_labels": {str(k): v for k, v in TID_LABELS.items()},
        "files": {name: {"sha256": _sha(data), "bytes": len(data)} for name, data in files.items()},
    }
    path = os.path.join(workdir, f"{region.slug}.zip")
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        zf.writestr("manifest.json", json.dumps(manifest, indent=1))
        for name, data in files.items():
            zf.writestr(name, data)
    with open(path, "rb") as fh:
        blob = fh.read()
    contents = {
        "region": region.slug,
        "files": list(files),
        "contours": len(json.loads(files["contours.geojson"])["features"]),
        "features": len(json.loads(files["features.geojson"])["features"]),
        "grid": [int(elev.shape[1]), int(elev.shape[0])],
    }
    return BuiltPackage(
        path, f"offline/bathymetry/{ds.id}/{region.slug}.zip", len(blob), _sha(blob), contents
    )

# Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Project structure, FastAPI, PostGIS, Redis/Celery, Docker Compose, auth foundation, MapLibre satellite map, device GPS | **Done** |
| 2 | GEBCO 2026 bathymetry (Maldives subset), depth contours, tap-for-depth, slope / drop-off / pinnacle candidates, offline packages (S3/MinIO) | Next |
| 3 | Copernicus Marine: SST, currents (u/v vectors), chlorophyll, waves; Celery ingestion with validation, provenance and freshness tracking | |
| 4 | Marine weather provider (after coverage evaluation), ocean-conditions dashboard, timestamps and provenance in UI | |
| 5 | Catch logbook (private by default, anonymised opt-in sharing), transparent jigging and tuna suitability scoring, validation against catches | |
| 6 | Captain Mode: navigation display, routes, waypoints, MOB, deviation / hazard / GPS-loss / battery alerts, night mode, offline navigation, AIS gateway design | |
| 7 | Subscriptions (configurable plans), Next.js admin dashboard, security and performance testing, production deployment | |

## Next task: Phase 2, step 1

1. Add MinIO (S3-compatible) to Compose, plus the `bathymetry_metadata`, `map_layers` and `data_providers` tables.
2. Write a GEBCO ingestion job that obtains the official GEBCO 2026 grid for the Maldives bounds.
   The exact retrieval mechanism (scripted download or operator-supplied file) will be confirmed against the
   current GEBCO download service. The job:
   - verifies checksums;
   - subsets to the Maldives bounds;
   - records resolution (15″ ≈ 460 m) and source metadata;
   - generates contour vector tiles and a hillshade/slope raster.
3. Add a depth-query endpoint (`/bathymetry/depth?lat=&lon=`) that returns the grid value plus a TID
   (source type) and a "not for navigation" flag.
4. Add a bathymetry layer toggle and tap-for-depth in the app.

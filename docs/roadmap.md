# Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Project structure, FastAPI, PostGIS, Redis/Celery, Docker Compose, auth foundation, MapLibre satellite map, device GPS | **Done** |
| 2 | GEBCO 2026 bathymetry (Maldives subset), depth contours, tap-for-depth, slope / drop-off / pinnacle candidates, layer panel, measurement, offline packages | **Done** |
| 3 | Copernicus Marine: SST, currents (u/v vectors), chlorophyll, waves; Celery ingestion with validation, provenance and freshness tracking | Next |
| 4 | Marine weather provider (after coverage evaluation), ocean-conditions dashboard, timestamps and provenance in UI | |
| 5 | Catch logbook (private by default, anonymised opt-in sharing), transparent jigging and tuna suitability scoring, validation against catches | |
| 6 | Captain Mode: navigation display, routes, waypoints, MOB, deviation / hazard / GPS-loss / battery alerts, night mode, offline navigation, AIS gateway design | |
| 7 | Subscriptions (configurable plans), Next.js admin dashboard, security and performance testing, production deployment | |

## Next task: Phase 3, step 1 (Copernicus Marine)

1. **Credentials:** create a Copernicus Marine account and set `COPERNICUS_MARINE_USERNAME` / `_PASSWORD` on the server only.
2. **Product selection:** verify Maldives coverage, resolution, update cadence and latency for each candidate product
   using the `copernicusmarine describe` metadata. Record the product and dataset IDs in `data_providers`.
   - SST: L4 analysis (observation-based) vs. model forecast.
   - Currents: global physics analysis/forecast (u/v).
   - Chlorophyll: ocean-colour L3/L4.
   - Waves: global wave analysis/forecast.
3. **Ingestion:** a Celery beat job subsets the Maldives box with `copernicusmarine subset`, validates
   (units, fill values, time axis) and stores rasters, keeping every time step's valid time and the product's
   observation/forecast nature.
4. **Publishing:** time-aware layers with explicit "observed at" / "forecast for" labels and staleness warnings,
   plus ocean values in the tap-for-depth sheet.

### Phase 2 follow-ups

- **Tiles:** a CDN in front of the tile endpoints.
- **Glyph server:** self-hosted glyphs for text labels.
- **Downloads:** resumable downloads for large packages.
- **Ingestion schedule:** periodic re-ingestion when GEBCO publishes a new grid (annual).

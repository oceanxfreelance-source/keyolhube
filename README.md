# JigMap Maldives

Marine navigation and fishing-intelligence platform for the Maldives:
fishing intelligence, captain-mode navigation and ocean conditions, online and offline.

> **Safety notice.** JigMap is not a certified nautical chart and does not replace
> official charts, radar, AIS equipment or required vessel safety equipment.
> Bathymetry (from Phase 2) is regional-scale GEBCO data and must never be used as
> a safe-clearance depth.

## Status: Phases 1–2 ✅

| Area | State |
|---|---|
| FastAPI backend (async SQLAlchemy, Alembic, OpenAPI docs at `/docs`) | Working, tested |
| PostgreSQL 16 + PostGIS 3.4, Redis 7, Celery worker, S3-compatible storage (SeaweedFS locally) | Working, tested |
| Auth: register / login / refresh rotation with reuse detection / logout / roles | Working, tested |
| **Free satellite imagery: own cloud-free Sentinel-2 mosaic** (default; no account, commercial + offline allowed) | **Working, built from real data** |
| Optional sharper imagery (Esri free tier) with a monthly cap that falls back to Sentinel-2 | Working, tested |
| Flutter app (Android / iOS / Web) with MapLibre satellite map and live GPS | Working, tested on web |
| **GEBCO 2026 bathymetry ingestion** (official CEDA archive, CRC-verified, validated) | **Working, run on real data** |
| Depth shading, slope layer, contour vector tiles with depth labels | Working, tested |
| Tap-for-depth with data source type (TID), dataset and release date, "not for navigation" | Working, tested |
| Drop-off / pinnacle / knoll / seamount **candidates** with explanations | Working, tested |
| Layer panel (toggle, opacity, data kind, source date), distance measurement (NM, bearing) | Working, tested |
| Offline packages (3 Maldives regions): download, verify, store, offline map + offline depth | Working, tested |
| Data provider registry and ingestion job log (admin API) | Working, tested |

Phases 3–7 (Copernicus ocean data, weather, logbook and intelligence, Captain Mode,
subscriptions and admin UI) are not started. See [docs/roadmap.md](docs/roadmap.md).

## Repository layout

```
backend/            FastAPI service, Alembic migrations, Celery worker, pytest suite
  app/api/v1/routes   health, auth, map, bathymetry, offline, data-providers, admin
  app/core            settings, security (JWT/Argon2), Redis, rate limiting, S3 storage
  app/ingestion       GEBCO job: remote ZIP streaming, terrain analysis, tiles, offline packages
  app/models          users, providers, ingestion jobs, map layers, bathymetry, offline packages
  app/services        auth, basemap/style/tile proxy, bathymetry serving, map overlays
  tests/fixtures      real GEBCO 2026 excerpt (Malé atolls, public domain) for pipeline tests
mobile/             Flutter app (package `jigmap`)
  lib/src/api         HTTP client with token refresh
  lib/src/auth        auth controller (secure storage), account sheet
  lib/src/bathymetry  depth/feature models and API client
  lib/src/location    GNSS service and fix model
  lib/src/map         map screen, layers sheet, depth sheet, measurement, contour labels
  lib/src/offline     package verification/decoding, local store (Hive), offline style, screen
  lib/src/ui          theme, GPS panel
e2e/                Playwright end-to-end tests of the web build (Phase 1 and Phase 2)
deploy/seaweedfs/   development S3 credentials for the local object store
docs/               architecture, data sources & licensing, roadmap
docker-compose.yml  db (PostGIS), redis, s3 (SeaweedFS), api, worker
```

## Prerequisites

- Docker with Compose v2
- Flutter 3.47 (stable) / Dart 3.13 for the app
- Python 3.12+ only if you run the backend outside Docker
- Android: Android SDK (API 36), JDK 21. iOS: Xcode 16+ (macOS)

## Running locally

```bash
cp .env.example .env          # then edit secrets
```

```bash
docker compose up -d --build
```

```bash
curl http://localhost:8000/api/v1/health/ready
```

API docs: <http://localhost:8000/docs>. The API container runs `alembic upgrade head` on start.

Everything can run for free: see [docs/free-stack.md](docs/free-stack.md).

### Load the bathymetry (once, then after each GEBCO release)

The job streams only the needed members of the official GEBCO 2026 archives from CEDA
(about 1 GB download; the full archive is 4.2 GB), verifies CRC-32 checksums, validates the
data and publishes contours, tiles, feature candidates and offline packages. It takes ~3 minutes.

```bash
docker compose exec worker python -m app.ingestion.gebco
```

Then build the free satellite imagery (needs the bathymetry; ~35 minutes for all islands and reefs,
rerun every few months to refresh):

```bash
docker compose exec worker python -m app.ingestion.sentinel2
```

The bathymetry job can also be queued from the admin API (`POST /api/v1/admin/ingestion/gebco`, admin role) and follow
`GET /api/v1/admin/ingestion/jobs`. Until it has run, bathymetry endpoints return 503 and the
app shows no depth layers.

**Behind a TLS-intercepting proxy**, pass its CA bundle as a build secret (it is not stored in the image):

```bash
docker build --secret id=extra_ca,src=/path/to/ca-bundle.crt -t jigmap/api:dev backend
```

### Flutter app

```bash
cd mobile && flutter pub get
```

Web (the API allows `http://localhost:8080` via `CORS_ORIGINS`):

```bash
flutter run -d chrome --web-port 8080 --dart-define=API_BASE_URL=http://localhost:8000
```

Android emulator (host machine is `10.0.2.2`); for a physical phone use your computer's LAN IP:

```bash
flutter run -d android --dart-define=API_BASE_URL=http://10.0.2.2:8000
```

Release builds:

```bash
flutter build apk --release --dart-define=API_BASE_URL=https://api.your-domain
```

```bash
flutter build web --release --dart-define=API_BASE_URL=https://api.your-domain
```

## Tests

Backend (needs `db`, `redis` and `s3` running; creates and migrates a `jigmap_test` database
and runs the real ingestion pipeline on a committed GEBCO excerpt):

```bash
docker compose up -d db redis s3
```

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
```

```bash
cd backend && .venv/bin/python -m pytest -q && .venv/bin/ruff check app tests
```

Flutter:

```bash
cd mobile && flutter analyze && flutter test
```

End-to-end (web build served on :8080, API on :8000, Playwright with Chromium):

```bash
cd mobile/build/web && python3 -m http.server 8080
```

```bash
node e2e/map_e2e.cjs
```

```bash
node e2e/phase2_e2e.cjs
```

The live-provider tests (`test_provider_status_live`, the tile-proxy test and the E2E tests)
need outbound internet access; they fail rather than pass silently when imagery is unreachable.
The Phase 2 E2E test needs bathymetry ingested in the database the API uses.

## Configuration

All configuration is via environment variables; see [.env.example](.env.example).
The API refuses to start with `ENVIRONMENT=production` if `JWT_SECRET` is the dev default
or if the satellite provider is development-only.

## Documentation

- [docs/architecture.md](docs/architecture.md): components, auth model, tile proxy, GPS handling
- [docs/free-stack.md](docs/free-stack.md): running everything at zero cost
- [docs/data-sources.md](docs/data-sources.md): provider evaluation, licensing and verification status
- [docs/roadmap.md](docs/roadmap.md): phase plan and what is outstanding

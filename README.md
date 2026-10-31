# JigMap Maldives

Marine navigation and fishing-intelligence platform for the Maldives:
fishing intelligence, captain-mode navigation and ocean conditions, online and offline.

> **Safety notice.** JigMap is not a certified nautical chart and does not replace
> official charts, radar, AIS equipment or required vessel safety equipment.
> Bathymetry (from Phase 2) is regional-scale GEBCO data and must never be used as
> a safe-clearance depth.

## Status: Phase 1 (foundation) ✅

| Area | State |
|---|---|
| FastAPI backend (async SQLAlchemy, Alembic, OpenAPI docs at `/docs`) | Working, tested |
| PostgreSQL 16 + PostGIS 3.4 (extension enabled by migration `0001`) | Working, tested |
| Redis 7 (rate limiting, Celery broker) + Celery worker | Working, tested |
| Auth: register / login / refresh rotation with reuse detection / logout / `me`, Argon2id, roles | Working, tested |
| Satellite basemap via configurable licensed provider, keys kept server-side (tile proxy) | Working, tested with Esri (dev endpoint) |
| Flutter app (Android / iOS / Web) with MapLibre satellite map | Working, tested on web |
| Device GPS: position, accuracy, SOG (kn), COG, fix age, signal-loss detection | Working, tested |

Phases 2–7 (bathymetry, Copernicus ocean data, weather, logbook and intelligence,
Captain Mode, subscriptions and admin) are not started. See [docs/roadmap.md](docs/roadmap.md).

## Repository layout

```
backend/            FastAPI service, Alembic migrations, Celery worker, pytest suite
  app/api/v1/routes   health, auth, map
  app/core            settings, security (JWT/Argon2), Redis, rate limiting
  app/models          SQLAlchemy models (users, refresh_tokens)
  app/services        auth, basemap providers / style / tile proxy
mobile/             Flutter app (package `jigmap`)
  lib/src/api         HTTP client with token refresh
  lib/src/auth        auth controller (secure storage), account sheet
  lib/src/location    GNSS service and fix model
  lib/src/map         basemap repository, map screen
  lib/src/ui          theme, GPS panel
e2e/                Playwright end-to-end test of the web build
docs/               architecture, data sources & licensing, roadmap
docker-compose.yml  db (PostGIS), redis, api, worker
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

Backend (needs `db` and `redis` running; creates and migrates a `jigmap_test` database):

```bash
docker compose up -d db redis
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

The live-provider tests (`test_provider_status_live`, the tile-proxy test and the E2E)
need outbound internet access; they fail rather than pass silently when imagery is unreachable.

## Configuration

All configuration is via environment variables; see [.env.example](.env.example).
The API refuses to start with `ENVIRONMENT=production` if `JWT_SECRET` is the dev default
or if the satellite provider is development-only.

## Documentation

- [docs/architecture.md](docs/architecture.md): components, auth model, tile proxy, GPS handling
- [docs/data-sources.md](docs/data-sources.md): provider evaluation, licensing and verification status
- [docs/roadmap.md](docs/roadmap.md): phase plan and what is outstanding

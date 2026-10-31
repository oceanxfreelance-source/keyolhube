# Architecture (Phases 1–2)

```
 Flutter app (Android / iOS / Web)                 FastAPI (uvicorn)            PostgreSQL 16 + PostGIS 3.4
 ┌───────────────────────────────┐  HTTPS/JSON   ┌──────────────────┐  asyncpg  ┌──────────────────────┐
 │ MapLibre map  ◄── style.json ─┼──────────────►│ /api/v1/map/*    │──────────►│ users, refresh_tokens │
 │ GPS panel     ◄── geolocator  │               │ /api/v1/auth/*   │           └──────────────────────┘
 │ Auth (secure storage)         │               │ /api/v1/health/* │  redis    ┌──────────────────────┐
 └──────────────┬────────────────┘               └────────┬─────────┘──────────►│ Redis 7               │
                │ tiles: direct (dev provider) or         │ tile proxy          │ rate limits, broker   │
                │ via API proxy with signed tile token    ▼                     └──────────┬───────────┘
                └──────────────────────────────► imagery provider                         │
                                                                     Celery worker ◄──────┘ (ingestion jobs from Phase 3)
```

## Backend

- **Settings** (`app/core/config.py`): pydantic-settings, environment only. Production guards refuse to start with
  the dev JWT secret or a development-only imagery provider.
- **Database**: async SQLAlchemy 2.0 + asyncpg. Schema changes go through Alembic only; migration `0001` enables PostGIS.
  Constraint naming conventions are set for stable migrations. All timestamps are `timestamptz` in UTC.
- **Auth**:
  - Argon2id password hashing (`pwdlib`).
  - Access tokens: 15-minute HS256 JWT with `sub`, `role`, `type=access`.
  - Refresh tokens: opaque random 64-char tokens. Only their SHA-256 hash is stored.
  - Every refresh rotates the token. Re-using a revoked token revokes all of that user's tokens (theft detection).
  - Login timing is equalised for unknown emails.
  - Roles: `captain`, `crew`, `admin`, with a `require_role` dependency ready for admin routes.
- **Rate limiting**: Redis fixed window per IP on register, login and refresh. Fails open (logged) if Redis is down;
  `/health/ready` then reports Redis as unavailable.
- **Health**: `/health/live` checks the process. `/health/ready` checks Postgres, the PostGIS version and Redis, and returns 503 on failure.
- **Map**:
  - `/map/config`: region and basemap metadata, including licence status.
  - `/map/style.json`: MapLibre style v8.
  - `/map/tiles/{z}/{x}/{y}`: proxy for keyed providers.
  - `/map/provider-status`: fetches one real tile over Malé and reports reachability, status, bytes and latency.
- **Worker**: Celery on the Redis broker. Currently only `system.ping`; ingestion jobs arrive in Phase 3.

## Bathymetry pipeline (Phase 2)

```
CEDA (official GEBCO zip) --range requests--> worker: stream members, CRC-32 verify
  -> exact 15" window -> validate -> GeoTIFFs (S3)
  -> slope, hillshade -> contours + candidates (PostGIS, GiST-indexed)
  -> depth/slope PNG tiles z4–10 (S3) -> regional offline packages (S3)
  -> atomic activation (one active dataset; map_layers registry updated; provider status set)
```

- Every run is a `data_ingestion_jobs` row with a timestamped log and stats; the provider row records
  `last_success_at` / `last_error`. A failed run leaves the previous dataset active, and the provider is marked `degraded`.
- **Serving:**
  - Depth queries use an in-memory copy of the active grid (10 MB, cached from S3).
  - Contours are vector tiles built on the fly with `ST_AsMVT`; the set of levels depends on zoom.
  - Raster tiles come from S3 through a small LRU cache.
  - `/map/style.json` includes the overlays plus layer metadata: data kind, attribution and source date.
- **Client:**
  - Contour depth labels are rendered by the app as icon images, so no font server is needed.
  - The MapLibre attribution box is hidden on web; the same credits appear as text under the GPS panel.
  - Tap-for-depth uses the API, falling back to downloaded packages when the server is unreachable.
  - Feature taps show the stored explanation.
- **Offline:**
  - Packages are verified (archive SHA-256 plus per-file SHA-256) and stored with Hive (IndexedDB on web, files on mobile).
  - When the API is unreachable, the map is rebuilt from the packages: contours and candidates as GeoJSON, plus local depth lookup.
  - Satellite imagery is not stored offline (licence).

## Mobile app

- Plain `ChangeNotifier`s, no state-management framework yet:
  - `AuthController` keeps the refresh token in platform secure storage and the access token in memory. It refreshes once on a 401.
  - `LocationService` wraps the platform location APIs with explicit states: checking, service off, permission denied or blocked, acquiring, tracking, error.
- The map style is fetched from the API, so the provider can change without an app release.
- The GPS position and accuracy ring are drawn as GeoJSON layers. The ring is a true metric circle, so it scales with zoom.
- Display conventions: positions in degrees and decimal minutes, speed in knots, times in MVT (UTC+5),
  missing values shown as "—".

## Known limitations

- **Map labels:** the app has no glyph server yet, so text labels (island names etc.) are not available. Depth
  labels use generated icons.
- **Offline map display:** offline mode replaces the whole style with packaged data. Mixing cached online tiles
  with offline layers is future work.

- **Tile tokens:** they are bearer tokens in the URL, valid 12 h, and the style must be re-fetched after expiry.
  Automatic re-fetch is planned with offline support in Phase 2.
- **Tile proxy scaling:** it streams every tile through the API. For high volume, put a CDN cache in front,
  where provider terms allow caching.
- **Platform testing:** iOS builds have not been verified in this environment (no macOS).

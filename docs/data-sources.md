# Data sources, licensing and verification status

Every data source is listed with its **verification status** in this codebase:

- **Verified live**: the code fetched real data from the provider during testing.
- **Implemented, unverified**: code exists but has not been exercised with a real credential.
- **Not connected**: no integration yet. The app must say so rather than show data.

## Satellite imagery (Phase 1)

The provider is selected with `SATELLITE_PROVIDER`. Keys are used **only on the server**:
for keyed providers the MapLibre style points at `/api/v1/map/tiles/{z}/{x}/{y}?t=<tile token>`,
where the tile token is a short-lived (default 12 h) signed token issued only to signed-in users.
The proxy validates the token and tile range, then fetches from the provider with the secret key.

| Provider id | Imagery | Commercial use | Offline caching | Status |
|---|---|---|---|---|
| `sentinel2_jigmap` (**default**) | Own cloud-free mosaic from Copernicus Sentinel-2 L2A (AWS Open Data, Element 84 Earth Search), 10 m | **Yes**, free, attribution "Contains modified Copernicus Sentinel data" | **Permitted** | **Verified live** (full Maldives build) |
| `esri_public_dev` | Esri World Imagery, public `server.arcgisonline.com` endpoint | **No**: development/evaluation only. Refused when `ENVIRONMENT=production`. | Not permitted | **Verified live** (tiles over Malé, z7–z14) |
| `esri_location_platform` | Esri World Imagery via ArcGIS Location Platform basemap tiles (`ibasemaps-api.arcgis.com`) with API key | Yes, billed per tile request to the ArcGIS account | Governed by Esri terms; **verify before enabling offline packs** | Implemented, unverified |
| `mapbox_satellite` | Mapbox Raster Tiles API, `mapbox.satellite` | Yes, billed to the Mapbox account | Mapbox terms restrict bulk/offline caching outside Mapbox SDK offline APIs. **Assume not permitted** for our offline packs. | Implemented, unverified |
| `maptiler_satellite` | MapTiler Satellite (`satellite-v2`) | Yes, per plan | Plan-dependent; MapTiler sells offline/self-hosted data packages | Implemented, unverified |
| `custom_xyz` | Any XYZ raster the operator is licensed for | Operator's responsibility | Operator's responsibility | Implemented (tested with a real XYZ endpoint) |

### Sentinel-2 mosaic details

- **Coverage.** Only z12 chunks (~9.8 km) containing land, reef or lagoon (GEBCO depth shallower than 100 m) are
  built. Open ocean stays transparent and shows the depth shading.
- **Compositing.**
  - Scenes come from the last 12 months with scene cloud cover under 60 %, least cloudy first, up to 8 per chunk.
  - Pixels are dropped using the Scene Classification band: cloud, cirrus and cloud shadow, with the cloud mask
    widened by about 40 m.
  - Each pixel takes the median of its clear observations. Pixels never seen clear fall back to the median of all
    observations, and the count is recorded.
- **Tiles.** WebP at z7–z14 (~9.5 m/px at z14). MapLibre over-zooms beyond that.
- **Provenance.** Stored per build: acquisition date range, scene IDs, chunk count and parameters. Shown in the
  app as "captured …".

### Recommendation (to confirm commercially)

For a production SaaS with mandatory offline use:

1. **Online imagery:** Esri via ArcGIS Location Platform or MapTiler, both of which bill per request and allow commercial apps.
2. **Offline imagery:** offline storage rights must be obtained explicitly in writing. Candidates are MapTiler's
   downloadable satellite packages (self-hosted MBTiles), or Esri's offline/export entitlements.
   Until that is confirmed, Phase 2 offline packs will contain **bathymetry and app data only**, not imagery.
3. Before launch: confirm pricing for the expected tile volume, and confirm attribution display requirements.
   The app shows the provider's attribution string from the style.

Imagery is an archived mosaic of varying capture dates. The API labels it
`data_kind: imagery_mosaic`; it is never a live observation.

## Device position (Phase 1)

Positions come only from the device's platform location services (Android Fused/GNSS,
iOS Core Location, browser Geolocation API) via `geolocator`. The app never synthesises a position.

- Values a platform did not report are shown as "—", never as 0. On web, `geolocator_web`
  substitutes `0.0` for missing speed and heading, so on web an exact `0.0` with zero accuracy is treated as unreported.
- Course over ground is hidden below 0.5 kn, where GNSS course is noise.
- A fix older than 15 s is shown as **GPS SIGNAL LOST** with its age. It is never shown as current.
- If the stream is quiet for 5 s, a fresh fix is requested explicitly (`maximumAge: 0` on web).
- Heading from a magnetometer/compass sensor is **not yet integrated** (Phase 6). The COG shown is GNSS course.

## Bathymetry: GEBCO 2026 (Phase 2) — **verified live**

| | |
|---|---|
| Source | GEBCO 2026 Grid, official distribution on CEDA: `gebco_2026_geotiff.zip` (4.24 GB) and `gebco_2026_tid_geotiff.zip` (96 MB), published 2026-04-22 |
| Citation (shown in the app) | GEBCO Compilation Group (2026) GEBCO 2026 Grid (doi:10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa) |
| Licence | Public domain; commercial use and redistribution permitted with attribution; must not imply GEBCO endorsement. **Must not be used for navigation** (GEBCO terms of use, read from the archive) |
| Retrieval | Byte-range reads of the ZIP central directory; only the 2 tiles covering 70–77.5°E, 3.5°S–8.5°N are streamed (~1 GB) and CRC-32 verified against the archive (`1158e298`, `23a19bec`, TID `4f0fc4f2`, `4f7eb028`) |
| Grid | 15 arc-second (~461 m), pixel-centre registered, 1800 × 2880 cells, no missing cells. Elevation −5,246 m to +1,726 m (the bounding box clips the southern tip of India) |
| Validation | CRS/resolution check, complete coverage, physical value range, TID codes against the official table, land-flag consistency |
| Data kind | `historical_compilation` (a static compilation, not an observation); contours/slope/candidates are `derived_analysis` |

**How much of the Maldives grid is actually measured** (TID statistics of the ingested window):

| TID | Meaning | Share of cells |
|---|---|---|
| 40 | Predicted from satellite-derived gravity | 95.67 % |
| 11 | Multibeam echo-sounder | 2.14 % |
| 44 | Bathymetric depths from multiple sources | 1.28 % |
| 16 | Optical light sensor (satellite-derived shallow depth) | 0.59 % |
| 0 | Land | 0.30 % |
| 17, 14 | Combination of direct methods; ENC soundings | 0.03 % |

So only ~2.8 % of cells are direct measurements. The app shows the source type on every
depth query and flags non-measured cells as lower confidence.

**Derived products** (parameters stored with each dataset, `analysis_params`):

- Isobaths at 10–5000 m (19 levels), simplified to a quarter cell, served as MVT from PostGIS.
- Slope in degrees from the metric cell spacing (real reef walls are steeper than a 461 m grid shows).
- Drop-off candidates: slope ≥ 15° at 15–1500 m depth, one point per ~3 km of edge.
- Rise candidates: local highs whose surroundings (1.4–2.8 km and 4.6–9.2 km rings) are ≥ 97 % deeper,
  with no land within the search radius. They are classified by relief using IHO/IOC terminology:
  seamount ≥ 1000 m, knoll 200–1000 m, pinnacle < 200 m. Pinnacles are kept only to 500 m summit depth
  and knolls only to 1500 m: deeper, low-relief bumps are mostly gravity-prediction noise.
- Real-data result: 543 drop-off, 4 pinnacle, 15 knoll and 9 seamount candidates.
  Every candidate carries a plain-language explanation and its source type.

**Offline packages**: three regional packages (north 2.1 MB, central 2.2 MB, south 3.0 MB), each containing
the int16 depth grid, TID grid, contours, candidates, and a manifest with SHA-256 per file. The app re-verifies
packages on download and on every load.

## Object storage

MinIO no longer distributes free server builds (`dl.min.io` returns 410 and Docker Hub has no `minio/minio`), so
local development uses **SeaweedFS** (Apache-2.0) as the S3-compatible store. Production should use a managed S3
service (AWS S3, Cloudflare R2, DigitalOcean Spaces…); only `S3_*` settings change.

## Planned sources (not connected)

| Data | Planned source | Phase | Status |
|---|---|---|---|
| SST, currents (u/v), chlorophyll, waves | Copernicus Marine Service (CMEMS) via `copernicusmarine` toolbox | 3 | Not connected |
| Marine weather (wind, rain, forecasts) | Provider to be selected after Maldives coverage evaluation (candidates: ECMWF open data, Open-Meteo marine/commercial, Stormglass) | 4 | Not connected |
| Authoritative nautical charts | Licensed ENC/S-57 from the hydrographic authority (via a licensed distributor) | 6 | Not connected; licensing to investigate |
| AIS | External receivers (NMEA 0183/2000 over Wi-Fi/Bluetooth gateways). A phone cannot receive AIS by itself. | 6 | Not connected |
| Payments | Provider to be selected after verifying availability in the Maldives | 7 | Not connected |

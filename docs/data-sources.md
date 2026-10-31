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
| `esri_public_dev` | Esri World Imagery, public `server.arcgisonline.com` endpoint | **No**: development/evaluation only. Refused when `ENVIRONMENT=production`. | Not permitted | **Verified live** (tiles over Malé, z7–z14) |
| `esri_location_platform` | Esri World Imagery via ArcGIS Location Platform basemap tiles (`ibasemaps-api.arcgis.com`) with API key | Yes, billed per tile request to the ArcGIS account | Governed by Esri terms; **verify before enabling offline packs** | Implemented, unverified |
| `mapbox_satellite` | Mapbox Raster Tiles API, `mapbox.satellite` | Yes, billed to the Mapbox account | Mapbox terms restrict bulk/offline caching outside Mapbox SDK offline APIs. **Assume not permitted** for our offline packs. | Implemented, unverified |
| `maptiler_satellite` | MapTiler Satellite (`satellite-v2`) | Yes, per plan | Plan-dependent; MapTiler sells offline/self-hosted data packages | Implemented, unverified |
| `custom_xyz` | Any XYZ raster the operator is licensed for | Operator's responsibility | Operator's responsibility | Implemented (tested with a real XYZ endpoint) |

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

## Planned sources (not connected)

| Data | Planned source | Phase | Status |
|---|---|---|---|
| Bathymetry | GEBCO 2026 grid (15 arc-second), Maldives subset | 2 | Not connected |
| SST, currents (u/v), chlorophyll, waves | Copernicus Marine Service (CMEMS) via `copernicusmarine` toolbox | 3 | Not connected |
| Marine weather (wind, rain, forecasts) | Provider to be selected after Maldives coverage evaluation (candidates: ECMWF open data, Open-Meteo marine/commercial, Stormglass) | 4 | Not connected |
| Authoritative nautical charts | Licensed ENC/S-57 from the hydrographic authority (via a licensed distributor) | 6 | Not connected; licensing to investigate |
| AIS | External receivers (NMEA 0183/2000 over Wi-Fi/Bluetooth gateways). A phone cannot receive AIS by itself. | 6 | Not connected |
| Payments | Provider to be selected after verifying availability in the Maldives | 7 | Not connected |

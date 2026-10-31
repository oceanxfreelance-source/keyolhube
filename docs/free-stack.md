# Running JigMap Maldives for free

Every data source and service the platform needs has a free option. This is what each part
uses, what "free" means for it, and the catches. Free-tier terms change: check each provider's
current page before you rely on it.

## Data (all free)

| Need | Free source | Account? | Commercial use | Offline storage |
|---|---|---|---|---|
| Satellite imagery (default) | **Our own Sentinel-2 mosaic**, built from Copernicus Sentinel-2 (10 m, cloud-free, last 12 months) | No | Yes, with attribution | Yes |
| Satellite imagery (optional, sharper) | Esri World Imagery via ArcGIS Location Platform free tier (2,000,000 tiles/month) | Free Esri account | Yes, within Esri's terms | No |
| Bathymetry | GEBCO 2026 Grid | No | Yes (public domain, attribution) | Yes |
| Ocean data (Phase 3) | Copernicus Marine Service | Free account | Yes, with attribution | Yes |
| Weather (Phase 4) | To be selected; candidates must allow free commercial use (e.g. ECMWF open data) | — | Verify | Verify |

### Satellite imagery: what you get for free

- **Sentinel-2 mosaic (default, recommended baseline).**
  - The job `python -m app.ingestion.sentinel2` composites a cloud-free image of every island, reef and lagoon
    from the free Copernicus Sentinel-2 archive on AWS Open Data. No account or key is needed.
  - Detail is 10 m per pixel. Islands, reef rings, lagoons, channels, harbours and the runway are clear, but
    individual boats or small coral heads are not.
  - Imagery is recent (the last 12 months) and can be rebuilt at any time to refresh it.
  - The licence allows commercial use and offline storage, so this imagery can go into offline packages.
- **Esri free tier (optional, much sharper: ~0.3–1 m).**
  - Create a free ArcGIS Location Platform account and an API key, then set
    `SATELLITE_PROVIDER=esri_location_platform` and `ESRI_API_KEY`.
  - **Do not add a payment method.** Esri does not cap usage for you once billing is enabled.
  - JigMap counts every Esri tile it serves and stops at `IMAGERY_MONTHLY_TILE_CAP` (default 1,900,000, below the
    2M free tier). Past the cap it serves the Sentinel-2 mosaic instead until the next month, so you can never
    exceed the free tier.
  - Esri imagery cannot be stored offline. Offline packages always use Sentinel-2.

## Hosting (free options and their catches)

The whole stack runs on one small server (2 CPU / 4–8 GB RAM is enough for early users) with the included
`docker-compose.yml`:

- PostGIS, Redis and the S3 store all run on that server, so there is nothing else to pay for.
- Storage needed today: about 40 MB of bathymetry plus a few hundred MB for the Sentinel-2 tiles.

| Option | Cost | Catch |
|---|---|---|
| Oracle Cloud "Always Free" ARM VM | Free | Signup needs a Visa/Mastercard for identity verification: a small temporary hold, no charge for Always Free resources. The CPU/RAM allowance is reported as 4 CPU/24 GB, but one 2026 report says it was cut to 2/12; either is enough. Capacity in some regions is limited. |
| Your own computer or an old laptop at home | Free | Must stay on; home internet upload speed limits how many users it can serve. Good for testing with friends. |
| Free object storage (Backblaze B2, 10 GB) | Free | Not needed (the server runs its own S3 store); useful later for backups. Check whether signup asks for a card. |

HTTPS certificates are free with Let's Encrypt.

## Distributing the app

| Channel | Cost |
|---|---|
| Web app (the Flutter web build, works on phones in the browser) | Free |
| Android APK shared directly (WhatsApp, website download) | Free |
| Google Play Store | One-time developer registration fee |
| Apple App Store / iOS | Annual developer fee, and building needs a Mac |

Start with the web app and a directly shared Android APK. Move to the stores when the subscriptions (Phase 7)
can pay for them.

## What still costs money later (optional)

- A custom domain name (you can start without one).
- Higher-resolution imagery beyond Esri's free tier.
- App store fees, when you choose to publish there.

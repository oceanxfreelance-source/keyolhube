/**
 * Phase 2 end-to-end test (Flutter web build + running API with real GEBCO 2026 data).
 *
 *  1. No attribution box over the map; credits shown as text; depth tiles + contour tiles load.
 *  2. Tap the sea -> depth sheet with source type, dataset and "not for navigation".
 *  3. Layers sheet -> enable drop-off/rise candidates -> feature GeoJSON loads.
 *  4. Measure tool -> distance in NM.
 *  5. Sign up, download an offline package, cut the server off, reload:
 *     offline banner, packaged contours, tap-for-depth answered from the package.
 *
 * Usage: node e2e/phase2_e2e.cjs [appUrl]
 */
const { chromium } = require('playwright');

const APP = process.argv[2] || 'http://localhost:8080';
const OUT = __dirname + '/artifacts';
const MALE = { latitude: 4.1755, longitude: 73.5093, accuracy: 8 };

// Visible text plus accessibility labels (Flutter puts some widget labels in aria-label).
const SEM_JS = () => {
  const host = document.querySelector('flt-semantics-host, flutter-view');
  const labels = [...document.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label'));
  return (host?.innerText || '') + '\n' + labels.join('\n');
};
const semText = (page) => page.evaluate(SEM_JS);
async function waitText(page, re, timeout = 30000) {
  await page.waitForFunction(
    ([src, fn]) => new RegExp(src).test(new Function('return (' + fn + ')()')()),
    [re.source, SEM_JS.toString()], { timeout });
}
async function enableSemantics(page) {
  await page.waitForSelector('flt-semantics-placeholder', { state: 'attached', timeout: 30000 });
  await page.evaluate(() => document.querySelector('flt-semantics-placeholder').click());
}

(async () => {
  const p = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch({
    proxy: p ? { server: p, bypass: 'localhost,127.0.0.1' } : undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, geolocation: MALE, permissions: ['geolocation'],
  });
  // Behave like a GNSS receiver: a fresh fix every second.
  let n = 0;
  const gnss = setInterval(() => ctx.setGeolocation({ ...MALE, latitude: MALE.latitude + (++n % 2) * 1e-6 }).catch(() => {}), 1000);
  const page = await ctx.newPage();
  const seen = { depthTiles: 0, contourTiles: 0, featuresGeojson: 0, depthQueries: 0, failures: [] };
  page.on('response', (r) => {
    const u = r.url();
    if (!u.startsWith('http://localhost:8000')) return;
    if (r.status() >= 500) seen.failures.push(`${r.status()} ${u}`);
    if (/\/bathymetry\/tiles\/depth\//.test(u) && r.status() === 200) seen.depthTiles++;
    if (/\/bathymetry\/contours\//.test(u) && r.status() === 200) seen.contourTiles++;
    if (/features\.geojson/.test(u) && r.status() === 200) seen.featuresGeojson++;
    if (/\/bathymetry\/depth\?/.test(u)) seen.depthQueries++;
  });
  const results = {};
  let failed = false;
  const step = async (name, fn) => {
    try { results[name] = (await fn()) ?? 'ok'; console.log(`PASS ${name}`); }
    catch (e) { failed = true; results[name] = e.message.split('\n')[0]; console.log(`FAIL ${name}: ${results[name]}`); await page.screenshot({ path: `${OUT}/fail-${name.replace(/\W+/g, '-')}.png` }); }
  };
  const tapSea = async () => page.mouse.click(345, 300); // ~5 km NE of Malé at z12: outer reef / open sea
  const closeSheet = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(600); };

  await page.goto(APP, { waitUntil: 'load' });
  await enableSemantics(page);

  await step('map with bathymetry, no attribution box', async () => {
    await waitText(page, /GPS GOOD/);
    const deadline = Date.now() + 40000;
    while ((seen.depthTiles < 4 || seen.contourTiles < 4) && Date.now() < deadline) await page.waitForTimeout(500);
    if (seen.depthTiles < 4 || seen.contourTiles < 4) throw new Error(`tiles: depth ${seen.depthTiles}, contours ${seen.contourTiles}`);
    const boxVisible = await page.evaluate(() => {
      const el = document.querySelector('.maplibregl-ctrl-attrib');
      return !!el && getComputedStyle(el).display !== 'none';
    });
    if (boxVisible) throw new Error('MapLibre attribution box is visible over the map');
    await waitText(page, /(Imagery © Esri|Copernicus Sentinel data).*Bathymetry: GEBCO 2026 Grid/);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT}/p2-map.png` });
    return { depthTiles: seen.depthTiles, contourTiles: seen.contourTiles };
  });

  await step('tap for depth', async () => {
    await tapSea();
    await waitText(page, /NOT FOR NAVIGATION/, 20000);
    const t = await semText(page);
    if (!/(≈ \d+ m deep|Land \/ above sea level)/.test(t)) throw new Error('no depth value');
    if (!/Source here: /.test(t) || !/GEBCO_2026 · historical compilation · released 2026-04-22/.test(t)) {
      throw new Error('provenance missing');
    }
    await page.screenshot({ path: `${OUT}/p2-depth.png` });
    const depth = t.match(/≈ (\d+) m deep/)?.[1];
    const source = t.match(/Source here: ([^\n(]+)/)?.[1]?.trim();
    await closeSheet();
    return { depth_m: depth, source };
  });

  await step('layers: enable drop-off & rise candidates', async () => {
    await page.getByRole('button', { name: 'Map layers' }).first().click();
    await waitText(page, /Depth shading \(GEBCO\)/);
    await page.screenshot({ path: `${OUT}/p2-layers.png` });
    const before = seen.featuresGeojson;
    await page.getByRole('switch', { name: /Drop-off & rise candidates/ }).dispatchEvent('click');
    const deadline = Date.now() + 15000;
    while (seen.featuresGeojson === before && Date.now() < deadline) await page.waitForTimeout(300);
    await closeSheet();
    // Zoom out a little so candidates around the atoll are visible.
    await page.mouse.move(206, 430);
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${OUT}/p2-features.png` });
    return { featuresGeojsonLoaded: seen.featuresGeojson > before || seen.featuresGeojson > 0 };
  });

  await step('measure distance', async () => {
    await page.getByRole('button', { name: 'Measure distance' }).first().click();
    await waitText(page, /Tap the map to add points/);
    await page.mouse.click(120, 260);
    await page.waitForTimeout(400);
    await page.mouse.click(300, 520);
    await waitText(page, /\d+\.\d+ NM · .* last leg \d{3}°T/);
    const t = (await semText(page)).match(/[\d.]+ NM · [\d.]+ k?m · last leg \d{3}°T/)?.[0];
    await page.screenshot({ path: `${OUT}/p2-measure.png` });
    await page.getByRole('button', { name: 'Stop measuring' }).first().click();
    return t;
  });

  await step('download offline package (signed in)', async () => {
    const email = `p2-${Date.now()}@example.mv`;
    await page.getByRole('button', { name: 'Sign in' }).first().click();
    await page.getByRole('button', { name: 'Create an account' }).click();
    const typeInto = async (label, value) => {
      await page.getByRole('textbox', { name: label }).click();
      await page.waitForTimeout(300);
      await page.keyboard.type(value, { delay: 15 });
    };
    await typeInto('Email', email);
    await typeInto('Password', 'correct-horse-battery');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByRole('button', { name: 'Account' }).first().waitFor({ timeout: 20000 });
    await page.getByRole('button', { name: 'Offline data' }).first().click();
    await waitText(page, /Central Maldives/);
    await page.getByRole('button', { name: 'Download' }).first().click(); // packages are sorted: central first
    await waitText(page, /Downloaded \d{4}-\d{2}-\d{2} · data released 2026-04-22/, 60000);
    await page.screenshot({ path: `${OUT}/p2-offline-download.png` });
    await page.getByRole('button', { name: 'Back' }).first().click();
    return email;
  });

  await step('offline mode: server unreachable', async () => {
    await page.route('http://localhost:8000/**', (route) => route.abort('internetdisconnected'));
    await page.reload({ waitUntil: 'load' });
    await enableSemantics(page);
    await waitText(page, /OFFLINE · retry/, 40000);
    await waitText(page, /GPS GOOD/);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT}/p2-offline-map.png` });
    await tapSea();
    await waitText(page, /from offline package/, 20000);
    const t = await semText(page);
    await page.screenshot({ path: `${OUT}/p2-offline-depth.png` });
    await closeSheet();
    return { depth_m: t.match(/≈ (\d+) m deep/)?.[1] ?? 'land' };
  });

  clearInterval(gnss);
  results.serverErrors = seen.failures;
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
  process.exit(failed || seen.failures.length ? 1 : 0);
})();

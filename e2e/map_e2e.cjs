/**
 * End-to-end check of the Flutter web build against the running API.
 *
 * - Loads the app in Chromium (WebGL via SwiftShader).
 * - Feeds the browser Geolocation API a position (Playwright geolocation
 *   emulation; the app itself contains no position-faking code).
 * - Verifies real satellite tiles are fetched from the configured provider,
 *   the GPS readout renders, and the permission-denied state is shown.
 *
 * Usage: node e2e/map_e2e.cjs [appUrl]   (API must be on :8000, app on :8080)
 */
const { chromium } = require('playwright');

const APP = process.argv[2] || 'http://localhost:8080';
const OUT = __dirname + '/artifacts';
const MALE = { latitude: 4.1755, longitude: 73.5093, accuracy: 8 };

function proxyOpts() {
  const p = process.env.HTTPS_PROXY || process.env.https_proxy;
  return p ? { server: p, bypass: 'localhost,127.0.0.1' } : undefined;
}

async function enableSemantics(page) {
  // Flutter web renders to canvas; enabling semantics exposes text to the DOM.
  await page.waitForSelector('flt-semantics-placeholder', { state: 'attached', timeout: 30000 });
  await page.evaluate(() => document.querySelector('flt-semantics-placeholder').click());
}

async function textVisible(page, re, timeout = 30000) {
  await page.waitForFunction(
    (src) => new RegExp(src).test(document.querySelector('flt-semantics-host, flutter-view')?.innerText || ''),
    re.source,
    { timeout },
  );
}

async function scenario(browser, name, contextOpts, check) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, ...contextOpts });
  const page = await ctx.newPage();
  const tiles = [];
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('response', async (r) => {
    if (/\/tiles?\/\d+\/\d+\/\d+/.test(r.url()) && !/bathymetry/.test(r.url())) {
      tiles.push({ url: r.url(), status: r.status(), type: r.headers()['content-type'] });
    }
  });
  await page.goto(APP, { waitUntil: 'load' });
  await enableSemantics(page);
  try {
    await check(page, tiles);
  } finally {
    await page.screenshot({ path: `${OUT}/${name}.png` });
    await ctx.close();
  }
  return { tiles, consoleErrors };
}

(async () => {
  const browser = await chromium.launch({
    proxy: proxyOpts(),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const results = {};
  let failed = false;
  const step = async (label, fn) => {
    try {
      results[label] = await fn();
      console.log(`PASS ${label}`);
    } catch (e) {
      failed = true;
      console.log(`FAIL ${label}: ${e.message.split('\n')[0]}`);
    }
  };

  await step('satellite map + GPS fix + signal-loss detection', async () => {
    const r = await scenario(browser, 'map-with-gps', { geolocation: MALE, permissions: ['geolocation'] }, async (page, tiles) => {
      // Behave like a GNSS receiver: a new fix every second with sub-metre jitter.
      // (Chromium's emulation otherwise only answers once for an unchanged position.)
      let n = 0;
      const receiver = setInterval(() => {
        n += 1;
        page.context().setGeolocation({ ...MALE, latitude: MALE.latitude + (n % 2) * 1e-6 }).catch(() => {});
      }, 1000);
      try {
        await textVisible(page, /04°10\.530'N/);
        await textVisible(page, /GPS GOOD/);
        await textVisible(page, /±8 m/);
        // The browser reports no speed: must be shown as unknown, never as 0.0 kn.
        const text = await page.evaluate(() => document.querySelector('flt-semantics-host, flutter-view').innerText);
        if (/0\.0 kn/.test(text)) throw new Error('fabricated 0.0 kn speed displayed');
        // Zoom 12 at devicePixelRatio 2 fetches z13 raster tiles, so accept z >= 12.
        const zoomOf = (u) => Number(u.match(/\/tiles?\/(\d+)\//)[1]);
        const near = () => tiles.filter((t) => t.status === 200 && zoomOf(t.url) >= 12).length;
        const deadline = Date.now() + 30000;
        while (near() < 4 && Date.now() < deadline) await page.waitForTimeout(500);
        // While fixes keep arriving the readout must stay fresh.
        await page.waitForTimeout(20000);
        await textVisible(page, /GPS GOOD/, 3000);
        await page.screenshot({ path: `${OUT}/map-with-gps-live.png` });
      } finally {
        clearInterval(receiver);
      }
      // Receiver goes silent: the app must flag the old fix instead of presenting it as current.
      await textVisible(page, /GPS SIGNAL LOST/, 30000);
    });
    const ok = r.tiles.filter((t) => t.status === 200 && /^image\//.test(t.type || ''));
    const near = ok.filter((t) => Number(t.url.match(/\/tiles?\/(\d+)\//)[1]) >= 12);
    if (near.length < 4) throw new Error('map did not centre on the GPS fix');
    const failedTiles = r.tiles.filter((t) => t.status !== 200).map((t) => `${t.status} ${t.url.split(/\/tiles?\//)[1]}`);
    return { imageryTiles: ok.length, tilesAtZoom12plus: near.length, failedTiles, sample: near[0].url, consoleErrors: r.consoleErrors.length };
  });

  await step('permission denied state', async () => {
    const r = await scenario(browser, 'gps-permission-denied', { permissions: [] }, async (page, tiles) => {
      await textVisible(page, /Location (permission not granted|blocked)/);
      // The map must still work without GPS.
      const deadline = Date.now() + 30000;
      while (tiles.filter((t) => t.status === 200).length < 4 && Date.now() < deadline) await page.waitForTimeout(500);
      await page.waitForTimeout(2000);
    });
    const ok = r.tiles.filter((t) => t.status === 200).length;
    if (ok < 4) throw new Error(`map did not load without GPS (${ok} tiles)`);
    return { message: 'shown', imageryTilesWithoutGps: ok };
  });

  await step('sign up + sign in through the UI', async () => {
    const email = `e2e-${Date.now()}@example.mv`;
    await scenario(browser, 'signed-in', { geolocation: MALE, permissions: ['geolocation'] }, async (page) => {
      await page.getByRole('button', { name: 'Sign in' }).first().click();
      await page.getByRole('button', { name: 'Create an account' }).click();
      // Flutter web text fields are transient DOM inputs: type like a user would.
      const typeInto = async (label, value) => {
        await page.getByRole('textbox', { name: label }).click();
        await page.waitForTimeout(300);
        await page.keyboard.type(value, { delay: 15 });
        await page.waitForTimeout(300);
      };
      await typeInto('Email', email);
      await typeInto('Password', 'correct-horse-battery');
      await page.getByRole('button', { name: 'Create account' }).click();
      // Sheet closes; account button now says "Account". Open it to see the profile.
      await page.getByRole('button', { name: 'Account' }).first().click({ timeout: 20000 });
      await textVisible(page, new RegExp(email.replace(/[.]/g, '\\.')));
    });
    return email;
  });

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
  process.exit(failed ? 1 : 0);
})();

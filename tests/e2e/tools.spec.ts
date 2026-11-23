import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { drag, newDesign, signUp, state, toScreen } from "./helpers";

async function pixelAt(page: Page, x: number, y: number) {
  const s = await toScreen(page, x, y);
  const box = (await page.locator("[data-testid=canvas] .konvajs-content").boundingBox())!;
  return page.evaluate(({ sx, sy }) => {
    const stage = (window as unknown as { __oceanx: { ui: { getState(): { stage: { toCanvas(o: object): HTMLCanvasElement } } } } }).__oceanx.ui.getState().stage;
    return Array.from(stage.toCanvas({ x: sx, y: sy, width: 1, height: 1, pixelRatio: 1 }).getContext("2d")!.getImageData(0, 0, 1, 1).data);
  }, { sx: s.x - box.x, sy: s.y - box.y });
}
type N = { type: string; name: string; data?: string; stroke?: { color: string; width: number; cap?: string }; curve?: number; height: number; original?: object; x: number; y: number; width: number };

test.beforeEach(async ({ page }) => { await signUp(page); await newDesign(page); });

test("brush draws a smooth editable path", async ({ page }) => {
  await page.keyboard.press("b");
  await expect(page.getByTestId("brush-bar")).toBeVisible();
  await page.locator('input[aria-label="Brush colour"]').fill("#e11d48");
  const a = await toScreen(page, 200, 300);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  for (let i = 1; i <= 40; i++) await page.mouse.move(a.x + i * 8, a.y + Math.sin(i / 4) * 60);
  await page.mouse.up();
  const n = (await state(page)).nodes[0] as unknown as N;
  expect(n.type).toBe("path");
  expect(n.name).toBe("Brush stroke");
  expect(n.stroke).toMatchObject({ color: "#e11d48", cap: "round" });
  // simplified: far fewer anchors than the 41 raw points
  expect((n.data!.match(/[CcLl]/g) ?? []).length).toBeLessThan(25);
});

test("curved text renders on an arc and exports as SVG textPath", async ({ page }) => {
  await page.click('nav button:has-text("Text")');
  await page.click('button:has-text("Add a heading")');
  const h0 = ((await state(page)).nodes[0] as unknown as N).height;
  await page.locator('input[aria-label="Curve"]').fill("60");
  const n = (await state(page)).nodes[0] as unknown as N;
  expect(n.curve).toBe(60);
  expect(n.height).toBeGreaterThan(h0); // the arc needs more height
  expect(await page.evaluate(() => (window as unknown as { __oceanx: { ui: { getState(): { stage: { find(s: string): unknown[] } } } } }).__oceanx.ui.getState().stage.find("TextPath").length)).toBe(1);
  await page.click('header button:has-text("Export")');
  await page.click('button:has-text("SVG")');
  const [svg] = await Promise.all([page.waitForEvent("download"), page.click('button:has-text("Download SVG")')]);
  expect(readFileSync((await svg.path())!, "utf8")).toContain("<textPath");
});

test("healing brush removes an object from a photo (original kept)", async ({ page }) => {
  await page.click('nav button:has-text("Uploads")');
  await page.setInputFiles("[data-testid=upload-input]", { name: "photo.jpg", mimeType: "image/jpeg", buffer: readFileSync("tests/e2e/fixtures/photo.jpg") });
  await expect.poll(async () => (await state(page)).nodes.length).toBe(1);
  await page.waitForTimeout(800);
  const n = (await state(page)).nodes[0] as unknown as N;
  const k = n.width / 1600; // displayed scale of the 1600x1000 photo
  const c = { x: n.x + 550 * k, y: n.y + 500 * k }; // red circle centre (radius 250 px in the photo)
  await expect.poll(async () => { const p = await pixelAt(page, c.x, c.y); return p[0] - p[1]; }, { timeout: 20_000 }).toBeGreaterThan(100); // red, once loaded
  await page.click('button:has-text("Remove objects (healing brush)")');
  await page.locator('input[aria-label="Healing brush size"]').fill("80");
  // paint over the circle with horizontal strokes
  for (let dy = -270; dy <= 270; dy += 30) {
    const half = Math.sqrt(Math.max(0, 280 ** 2 - dy ** 2));
    const p = await toScreen(page, c.x - half * k, c.y + dy * k);
    const z = (await state(page)).zoom;
    await drag(page, p, 2 * half * k * z, 0);
  }
  await page.click('[data-testid=heal-bar] button:has-text("Remove")');
  await expect.poll(async () => !!((await state(page)).nodes[0] as unknown as N).original, { timeout: 60_000 }).toBe(true);
  await page.waitForTimeout(1500);
  const after = await pixelAt(page, c.x, c.y);
  expect(after[0] - after[1]).toBeLessThan(60);   // the red object is gone (filled from the gradient around it)
  await page.click('[data-testid=heal-bar] button:has-text("Done")');
  await expect(page.locator('button:has-text("Restore background")')).toBeVisible(); // original kept
  await page.evaluate(() => (window as unknown as { __oceanx: { store: { getState(): { select(i: string[]): void } } } }).__oceanx.store.getState().select([]));
  await page.waitForTimeout(500);
  await page.screenshot({ path: process.env.SHOT ?? "test-results/healed.png" });
});

test("draw tools: drag to create a rectangle, ellipse and text box", async ({ page }) => {
  await page.keyboard.press("r");
  const a = await toScreen(page, 100, 100), z = (await state(page)).zoom;
  await drag(page, a, 300 * z, 200 * z);
  let n = (await state(page)).nodes[0] as unknown as N & { height: number };
  expect(n.type).toBe("rect");
  expect(Math.abs(n.width - 300)).toBeLessThan(4); expect(Math.abs(n.height - 200)).toBeLessThan(4);
  await page.keyboard.press("o");
  await drag(page, await toScreen(page, 500, 500), 200 * z, 200 * z);
  n = (await state(page)).nodes[1] as unknown as N & { height: number };
  expect(n.type).toBe("ellipse");
  await page.keyboard.press("Escape");
  await page.keyboard.press("t");
  await drag(page, await toScreen(page, 100, 800), 600 * z, 50 * z);
  await expect(page.locator('textarea[aria-label="Edit text"]')).toBeVisible();
  await page.keyboard.type("Hello");
  await page.mouse.click(5, 300);
  expect(((await state(page)).nodes[2] as unknown as { text: string }).text).toBe("Hello");
});

test("elements library: search icons, add a sticker and a badge", async ({ page }) => {
  await page.fill('input[aria-label="Search elements"]', "fish");
  await page.click('button[aria-label="Add icon fish"]');
  let s = await state(page);
  expect(s.nodes[0].type).toBe("group");
  await page.fill('input[aria-label="Search elements"]', "maldives");
  await page.click('button[aria-label="Add sticker Maldives flag"]');
  await expect.poll(async () => (await state(page)).nodes.length, { timeout: 30_000 }).toBe(2);
  s = await state(page);
  expect(s.nodes[1].type).toBe("image");
  await page.fill('input[aria-label="Search elements"]', "");
  await page.click('button[aria-label="Add Sale burst"]');
  expect((await state(page)).nodes[2].type).toBe("group");
});

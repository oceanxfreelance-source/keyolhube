import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { newDesign, signUp, state, toScreen } from "./helpers";

/** Read the rendered canvas pixel at a document coordinate. */
async function pixelAt(page: Page, x: number, y: number) {
  const s = await toScreen(page, x, y);
  const box = (await page.locator("[data-testid=canvas]").boundingBox())!;
  return page.evaluate(({ sx, sy }) => {
    const stage = (window as unknown as { __oceanx: { ui: { getState(): { stage: { toCanvas(o: object): HTMLCanvasElement } } } } }).__oceanx.ui.getState().stage;
    const c = stage.toCanvas({ x: sx, y: sy, width: 1, height: 1, pixelRatio: 1 });
    return Array.from(c.getContext("2d")!.getImageData(0, 0, 1, 1).data);
  }, { sx: s.x - box.x, sy: s.y - box.y });
}

test("photo adjustments: presets, sliders, before/after, export", async ({ page }) => {
  await signUp(page);
  await newDesign(page);
  await page.click('nav button:has-text("Uploads")');
  await page.setInputFiles("[data-testid=upload-input]", { name: "photo.jpg", mimeType: "image/jpeg", buffer: readFileSync("tests/e2e/fixtures/photo.jpg") });
  await expect.poll(async () => (await state(page)).nodes.length).toBe(1);
  await page.waitForTimeout(1200);
  const n = (await state(page)).nodes[0];
  // a point inside the red circle (source 550,500 of 1600x1000)
  const px = n.x + (550 / 1600) * n.width, py = n.y + (500 / 1000) * n.height;
  const before = await pixelAt(page, px, py);
  expect(before[0]).toBeGreaterThan(180); expect(before[1]).toBeLessThan(100);

  await expect(page.locator('button[aria-label="Preset Black & white"] img')).toBeVisible({ timeout: 20_000 });
  await page.click('button[aria-label="Preset Black & white"]');
  await page.waitForTimeout(800);
  const bw = await pixelAt(page, px, py);
  expect(Math.abs(bw[0] - bw[1])).toBeLessThan(4); expect(Math.abs(bw[1] - bw[2])).toBeLessThan(4);

  // hold "original" shows the untouched photo
  const btn = page.locator('button[aria-label="Hold to compare with the original"]');
  await btn.hover(); await page.mouse.down(); await page.waitForTimeout(600);
  const orig = await pixelAt(page, px, py);
  expect(orig[0] - orig[1]).toBeGreaterThan(80);
  await page.mouse.up(); await page.waitForTimeout(600);

  // slider: exposure up brightens; time several updates (smoothness)
  const exp = page.locator('input[aria-label="Exposure"]');
  const t0 = Date.now();
  for (const v of ["0.5", "1", "1.5"]) { await exp.fill(v); }
  const elapsed = Date.now() - t0;
  await page.waitForTimeout(500);
  const bright = await pixelAt(page, px, py);
  expect(bright[0]).toBeGreaterThan(bw[0] + 10); // HSL greyscale of the brightened red: ~160 vs ~135
  console.log(`3 exposure updates in ${elapsed} ms`);
  const s = await state(page);
  expect((s.nodes[0] as unknown as { adjust: { exposure: number; saturation: number } }).adjust).toMatchObject({ exposure: 1.5, saturation: -100 });

  // undo removes the slider change in one step (merged), reset clears all
  await page.keyboard.press("Control+z");
  expect((await state(page)).nodes[0]).toMatchObject({ adjust: { saturation: -100 } });
  expect(((await state(page)).nodes[0] as unknown as { adjust: { exposure?: number } }).adjust.exposure).toBeUndefined();

  // exported PNG has the adjustment (grey circle)
  await page.click('header button:has-text("Export")');
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click('button:has-text("Download PNG")')]);
  const file = (await dl.path())!;
  const pixel = await page.evaluate(async ({ b64, fx, fy }) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0);
    return Array.from(ctx.getImageData(Math.round(fx * img.width), Math.round(fy * img.height), 1, 1).data);
  }, { b64: readFileSync(file).toString("base64"), fx: px / 1080, fy: py / 1080 });
  expect(Math.abs(pixel[0] - pixel[1])).toBeLessThan(4);
});

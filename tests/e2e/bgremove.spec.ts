import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { newDesign, signUp, state, toScreen } from "./helpers";

async function pixelAt(page: Page, x: number, y: number) {
  const s = await toScreen(page, x, y);
  const box = (await page.locator("[data-testid=canvas]").boundingBox())!;
  return page.evaluate(({ sx, sy }) => {
    const stage = (window as unknown as { __oceanx: { ui: { getState(): { stage: { toCanvas(o: object): HTMLCanvasElement } } } } }).__oceanx.ui.getState().stage;
    return Array.from(stage.toCanvas({ x: sx, y: sy, width: 1, height: 1, pixelRatio: 1 }).getContext("2d")!.getImageData(0, 0, 1, 1).data);
  }, { sx: s.x - box.x, sy: s.y - box.y });
}
type Img = { type: string; x: number; y: number; width: number; height: number; original?: object; src: string };

test("remove background from a portrait, then restore it", async ({ page }) => {
  test.setTimeout(240_000);
  await signUp(page);
  await newDesign(page);
  // a coloured page so transparency is visible
  await page.click('button[aria-label="Colour #10b981"]');
  await page.click('nav button:has-text("Uploads")');
  await page.setInputFiles("[data-testid=upload-input]", { name: "portrait.jpg", mimeType: "image/jpeg", buffer: readFileSync("tests/e2e/fixtures/portrait.jpg") });
  await expect.poll(async () => (await state(page)).nodes.length).toBe(1);
  await page.waitForTimeout(800);
  const n = (await state(page)).nodes[0] as unknown as Img;
  const corner = { x: n.x + n.width * 0.06, y: n.y + n.height * 0.05 };   // backdrop, top-left
  const face = { x: n.x + n.width * 0.5, y: n.y + n.height * 0.33 };      // the face
  const before = await pixelAt(page, corner.x, corner.y);
  expect(before.slice(0, 3)).not.toEqual([16, 185, 129]);

  await page.click('button:has-text("Remove background (people)")');
  await expect.poll(async () => !!((await state(page)).nodes[0] as unknown as Img).original, { timeout: 180_000 }).toBe(true);
  await page.waitForTimeout(1500);
  const after = await pixelAt(page, corner.x, corner.y);
  expect(after.slice(0, 3)).toEqual([16, 185, 129]);            // backdrop gone: the green page shows
  const faceAfter = await pixelAt(page, face.x, face.y);
  expect(faceAfter.slice(0, 3)).not.toEqual([16, 185, 129]);    // the person is still there

  await page.click('button:has-text("Restore background")');
  expect(((await state(page)).nodes[0] as unknown as Img).original).toBeUndefined();
  await page.waitForTimeout(1000);
  expect((await pixelAt(page, corner.x, corner.y)).slice(0, 3)).not.toEqual([16, 185, 129]);
});

test("photos without a person get a clear message", async ({ page }) => {
  test.setTimeout(240_000);
  await signUp(page);
  await newDesign(page);
  await page.click('nav button:has-text("Uploads")');
  await page.setInputFiles("[data-testid=upload-input]", { name: "shapes.jpg", mimeType: "image/jpeg", buffer: readFileSync("tests/e2e/fixtures/photo.jpg") });
  await expect.poll(async () => (await state(page)).nodes.length).toBe(1);
  await page.click('button:has-text("Remove background (people)")');
  await expect(page.locator("aside [role=alert]")).toContainText("No person found", { timeout: 180_000 });
});

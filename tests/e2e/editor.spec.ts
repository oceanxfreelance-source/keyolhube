import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { drag, newDesign, signUp, state, toScreen, waitSaved } from "./helpers";

test.beforeEach(async ({ page }) => {
  await signUp(page);
});

test("create, edit, move, resize, undo, persist", async ({ page }) => {
  await newDesign(page);
  await page.click('button[aria-label="Add Square"]');
  let s = await state(page);
  const n0 = s.nodes[0];
  expect(s.sel).toEqual([n0.id]);
  // drag ~150 doc px right; snapping may adjust by a few px
  const c = await toScreen(page, n0.x + n0.width / 2, n0.y + n0.height / 2);
  await drag(page, c, 150 * s.zoom, 0);
  s = await state(page);
  expect(Math.abs(s.nodes[0].x - n0.x - 150)).toBeLessThan(8);
  // resize from the bottom-right handle
  const br = await toScreen(page, s.nodes[0].x + s.nodes[0].width, s.nodes[0].y + s.nodes[0].height);
  await drag(page, br, 80 * s.zoom, 80 * s.zoom);
  s = await state(page);
  expect(s.nodes[0].width).toBeGreaterThan(n0.width + 40);
  // undo twice returns to the original position and size
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  s = await state(page);
  expect(s.nodes[0].x).toBe(n0.x);
  expect(s.nodes[0].width).toBe(n0.width);
  await page.keyboard.press("Control+Shift+z");
  // colour via swatch
  await page.click('button[aria-label="Colour #ef4444"]');
  await waitSaved(page);
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __oceanx?: unknown }).__oceanx);
  s = await state(page);
  expect(s.nodes).toHaveLength(1);
  expect((s.nodes[0] as unknown as { fill: { color: string } }).fill.color).toBe("#ef4444");
});

test("Dhivehi and mixed text editing", async ({ page }) => {
  await newDesign(page);
  await page.click('nav button:has-text("Text")');
  await page.click('button:has-text("ދިވެހި ސުރުޚީ")');
  let s = await state(page);
  const t = s.nodes[0];
  expect(t.type).toBe("text");
  const p = await toScreen(page, t.x + t.width - 40, t.y + t.height / 2);
  await page.mouse.dblclick(p.x, p.y);
  const ta = page.locator('textarea[aria-label="Edit text"]');
  await expect(ta).toBeVisible();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("ރައީސް 2026 Vote");
  await expect(ta).toHaveCSS("direction", "rtl");
  await page.mouse.click(5, 300); // click away = save
  s = await state(page);
  expect(s.nodes[0].text).toBe("ރައީސް 2026 Vote");
  expect(s.editing).toBeNull();
});

test("group, ungroup, duplicate, delete, layers", async ({ page }) => {
  await newDesign(page);
  await page.click('button[aria-label="Add Circle"]');
  await page.click('button[aria-label="Add Star"]');
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+g");
  let s = await state(page);
  expect(s.nodes.map((n) => n.type)).toEqual(["group"]);
  await page.keyboard.press("Control+d");
  s = await state(page);
  expect(s.nodes).toHaveLength(2);
  await page.keyboard.press("Delete");
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+Shift+g");
  s = await state(page);
  expect(s.nodes.map((n) => n.type)).toEqual(["ellipse", "star"]);
  await page.click('nav button:has-text("Layers")');
  await page.click('button[aria-label="Hide Star"]');
  s = await state(page);
  expect((s.nodes[1] as unknown as { visible: boolean }).visible).toBe(false);
});

test("pages: add, duplicate, delete", async ({ page }) => {
  await newDesign(page);
  await page.click('button[aria-label="Add Square"]');
  await page.click('nav button:has-text("Pages")');
  await page.click('button[aria-label="Duplicate Page 1"]');
  let s = await state(page);
  expect(s.pages).toBe(2);
  expect(s.nodes).toHaveLength(1); // duplicated content, new ids
  await page.click('button:has-text("Add page")');
  s = await state(page);
  expect(s.pages).toBe(3);
  expect(s.nodes).toHaveLength(0);
  await page.click('button[aria-label="Delete Page 3"]');
  expect((await state(page)).pages).toBe(2);
});

function png(w: number, h: number): Buffer {
  const t = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * (w * 3 + 1) + 1 + x * 3; raw[i] = 20; raw[i + 1] = 120 + (y % 100); raw[i + 2] = 200; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ih), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

test("upload image, crop, exports", async ({ page }) => {
  await newDesign(page);
  await page.click('nav button:has-text("Uploads")');
  await page.setInputFiles("[data-testid=upload-input]", { name: "photo.png", mimeType: "image/png", buffer: png(400, 200) });
  await expect.poll(async () => (await state(page)).nodes.length).toBe(1);
  let s = await state(page);
  expect(s.nodes[0].type).toBe("image");
  expect(s.nodes[0].width / s.nodes[0].height).toBeCloseTo(2, 1);
  await page.click('button:has-text("Fill frame")');
  s = await state(page);
  expect((s.nodes[0] as unknown as { crop: unknown }).crop).not.toBeNull();

  await page.click('header button:has-text("Export")');
  const [png1] = await Promise.all([page.waitForEvent("download"), page.click('button:has-text("Download PNG")')]);
  const pngPath = await png1.path();
  const buf = readFileSync(pngPath!);
  expect(buf.subarray(1, 4).toString()).toBe("PNG");
  expect(buf.readUInt32BE(16)).toBe(2160); // 2x of 1080
  await page.click('button:has-text("PDF (print)")');
  const [pdf] = await Promise.all([page.waitForEvent("download"), page.click('button:has-text("Download PDF")')]);
  expect(readFileSync((await pdf.path())!).subarray(0, 5).toString()).toBe("%PDF-");
  await page.click('button:has-text("SVG")');
  const [svg] = await Promise.all([page.waitForEvent("download"), page.click('button:has-text("Download SVG")')]);
  const svgText = readFileSync((await svg.path())!, "utf8");
  expect(svgText).toContain("<svg");
  expect(svgText).toContain("data:image/png;base64");
});

test("version history: name, change, restore", async ({ page }) => {
  await newDesign(page);
  await page.click('button[aria-label="Add Square"]');
  await waitSaved(page);
  await page.click('button[aria-label="Version history"]');
  await page.fill('input[aria-label="Version name"]', "One square");
  await page.click('[role=dialog] button:has-text("Save")');
  await expect(page.locator("[role=dialog]")).toContainText("One square");
  await page.click('[role=dialog] button[aria-label=Close]');
  await page.click('button[aria-label="Add Circle"]');
  await waitSaved(page);
  expect((await state(page)).nodes).toHaveLength(2);
  await page.click('button[aria-label="Version history"]');
  page.once("dialog", (d) => d.accept());
  await page.locator("[role=dialog] li", { hasText: "One square" }).locator('button:has-text("Restore")').click();
  await expect.poll(async () => (await state(page)).nodes.length).toBe(1);
});

test("conflict between two tabs is detected, not overwritten", async ({ page, context }) => {
  await newDesign(page);
  const url = page.url();
  const other = await context.newPage();
  await other.goto(url);
  await other.waitForFunction(() => (window as unknown as { __oceanx?: unknown }).__oceanx);
  await page.click('button[aria-label="Add Square"]');
  await waitSaved(page);
  await other.click('button[aria-label="Add Star"]');
  await expect(other.getByText("Changed in another tab")).toBeVisible({ timeout: 20_000 });
  await other.click('button:has-text("Load latest")');
  await expect.poll(async () => (await state(other)).nodes.map((n) => n.type)).toEqual(["rect"]);
});

test("phone layout @phone", async ({ page }) => {
  await newDesign(page, "story");
  await page.click('nav button:has-text("Elements")');
  await page.click('button[aria-label="Add Circle"]');
  await expect(page.locator("aside[aria-label=elements]")).toHaveCount(0);
  await expect(page.locator("aside[aria-label=Properties]")).toBeVisible();
  const header = await page.locator("header").boundingBox();
  expect(header!.y).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

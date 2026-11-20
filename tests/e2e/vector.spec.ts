import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { drag, newDesign, signUp, state, toScreen } from "./helpers";

async function pixelAt(page: Page, x: number, y: number) {
  const s = await toScreen(page, x, y);
  const box = (await page.locator("[data-testid=canvas]").boundingBox())!;
  return page.evaluate(({ sx, sy }) => {
    const stage = (window as unknown as { __oceanx: { ui: { getState(): { stage: { toCanvas(o: object): HTMLCanvasElement } } } } }).__oceanx.ui.getState().stage;
    return Array.from(stage.toCanvas({ x: sx, y: sy, width: 1, height: 1, pixelRatio: 1 }).getContext("2d")!.getImageData(0, 0, 1, 1).data);
  }, { sx: s.x - box.x, sy: s.y - box.y });
}
type PathLike = { type: string; data: string; x: number; y: number; width: number; height: number; fill: { type: string } };

test.beforeEach(async ({ page }) => { await signUp(page); await newDesign(page); });

test("pen tool draws corners and curves, closes, then points are editable", async ({ page }) => {
  await page.keyboard.press("p");
  const a = await toScreen(page, 200, 200), b = await toScreen(page, 600, 200), c = await toScreen(page, 400, 600);
  await page.mouse.click(a.x, a.y);                       // corner
  await drag(page, b, 60, 60);                            // curve (drag out handles)
  await page.mouse.click(c.x, c.y);                       // corner
  await page.mouse.click(a.x, a.y);                       // click first point: close
  let s = await state(page);
  const p = s.nodes[0] as unknown as PathLike;
  expect(p.type).toBe("path");
  expect(p.data).toMatch(/c/i);                            // contains a curve segment
  expect(p.data.trim().toLowerCase().endsWith("z")).toBe(true);
  expect(p.fill.type).toBe("solid");                       // closed paths get a fill
  // double-click to edit points; drag the bottom anchor down 100 doc px
  const mid = await toScreen(page, 400, 330);
  await page.mouse.dblclick(mid.x, mid.y);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __oceanx: { ui: { getState(): { editingPathId: string | null } } } }).__oceanx.ui.getState().editingPathId)).toBe(p.type === "path" ? s.nodes[0].id : "");
  const h0 = p.height;
  await drag(page, await toScreen(page, 400, 600), 0, 100 * s.zoom);
  s = await state(page);
  expect((s.nodes[0] as unknown as PathLike).height).toBeGreaterThan(h0 + 80);
  // click on the straight top edge region? add a point on the left edge (corner a -> c is straight)
  const before = ((s.nodes[0] as unknown as PathLike).data.match(/[LlCcHhVv]/g) ?? []).length;
  const e = await toScreen(page, 300, 450);
  await page.mouse.click(e.x, e.y);
  s = await state(page);
  const after = ((s.nodes[0] as unknown as PathLike).data.match(/[LlCcHhVv]/g) ?? []).length;
  expect(after).toBe(before + 1);
  await page.keyboard.press("Escape");
});

test("unite/subtract, convert to path, mask a photo inside a circle", async ({ page }) => {
  await page.click('button[aria-label="Add Square"]');
  await page.click('button[aria-label="Add Circle"]');
  // move circle right so they overlap partly
  let s = await state(page);
  const circ = s.nodes[1];
  await drag(page, await toScreen(page, circ.x + circ.width / 2, circ.y + circ.height / 2), 150 * s.zoom, 0);
  await page.keyboard.press("Control+a");
  await page.click('button[aria-label="Subtract shapes"]');
  s = await state(page);
  expect(s.nodes).toHaveLength(1);
  expect(s.nodes[0].type).toBe("path");
  expect(s.nodes[0].width).toBeLessThan(330);              // square minus circle, narrower than the square+circle
  await page.keyboard.press("Delete");

  // convert a star to a path
  await page.click('button[aria-label="Add Star"]');
  await page.click('button:has-text("Convert to path")');
  s = await state(page);
  expect(s.nodes[0].type).toBe("path");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");

  // photo masked by a circle
  await page.click('button[aria-label="Add Circle"]');
  await page.click('nav button:has-text("Uploads")');
  await page.setInputFiles("[data-testid=upload-input]", { name: "photo.jpg", mimeType: "image/jpeg", buffer: readFileSync("tests/e2e/fixtures/photo.jpg") });
  await expect.poll(async () => (await state(page)).nodes.length).toBe(2);
  await page.waitForTimeout(800);
  s = await state(page);
  const img = s.nodes[1], c = s.nodes[0];
  // a corner of the photo outside the circle shows the photo before masking
  const cornerX = c.x + 5, cornerY = c.y + 5;
  const pre = await pixelAt(page, cornerX, cornerY);
  expect(pre.slice(0, 3)).not.toEqual([255, 255, 255]);
  await page.keyboard.press("Control+a");
  await page.click('button:has-text("Mask with bottom shape")');
  await page.waitForTimeout(500);
  s = await state(page);
  expect(s.nodes).toHaveLength(1);
  expect((s.nodes[0] as unknown as { mask: boolean }).mask).toBe(true);
  const post = await pixelAt(page, cornerX, cornerY);
  expect(post.slice(0, 3)).toEqual([255, 255, 255]);      // outside the circle: page background
  const centre = await pixelAt(page, c.x + c.width / 2, c.y + c.height / 2);
  expect(centre.slice(0, 3)).not.toEqual([255, 255, 255]); // inside: the photo
  void img;
  // SVG export contains the clip path
  await page.click('header button:has-text("Export")');
  await page.click('button:has-text("SVG")');
  const [svg] = await Promise.all([page.waitForEvent("download"), page.click('button:has-text("Download SVG")')]);
  expect(readFileSync((await svg.path())!, "utf8")).toContain("clip-path=\"url(#mask");
  await page.click('[role=dialog] button[aria-label=Close]');
  // release mask
  await page.click('button:has-text("Release mask")');
  expect((await state(page)).nodes.map((n) => n.type)).toEqual(["ellipse", "image"]);
});

test("SVG import makes editable vector layers and reports skipped text", async ({ page }) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
    <rect x="0" y="0" width="100" height="100" fill="#ff0000"/>
    <circle cx="150" cy="50" r="40" fill="#0000ff" stroke="#000" stroke-width="4"/>
    <text x="10" y="90">Hello</text><script>alert(1)</script></svg>`;
  await page.click('nav button:has-text("Uploads")');
  await page.setInputFiles("[data-testid=upload-input]", { name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from(svg) });
  await expect.poll(async () => (await state(page)).nodes.length).toBe(1);
  const g = (await state(page)).nodes[0] as unknown as { type: string; children: { type: string; fill: { color: string }; stroke: { width: number } | null }[] };
  expect(g.type).toBe("group");
  expect(g.children.map((c) => c.type)).toEqual(["path", "path"]);
  expect(g.children[0].fill.color.toLowerCase()).toBe("#ff0000");
  expect(g.children[1].stroke?.width).toBeGreaterThan(0);
  await expect(page.locator("aside [role=alert]")).toContainText("1 text element");
});

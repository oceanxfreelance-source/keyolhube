import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { newDesign, signUp, state, waitSaved } from "./helpers";

type N = { id: string; type: string; name: string; text?: string; fontFamily?: string; fill?: { color?: string }; stroke?: { dash?: number[]; cap?: string } | null; mask?: boolean; children?: N[] };
const editorReady = (page: import("@playwright/test").Page) => page.waitForFunction(() => (window as unknown as { __oceanx?: unknown }).__oceanx, null, { timeout: 60_000 });

test("templates: start from one, apply in the editor, save your own", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "Templates", exact: true }).first().click();
  await page.click('button[aria-pressed]:has-text("Election")');
  await page.locator("[data-template=election-poster-dv]").scrollIntoViewIfNeeded();
  await expect(page.locator("[data-template=election-poster-dv] img")).toBeVisible({ timeout: 30_000 });
  await page.click("[data-template=election-poster-dv]");
  await page.waitForURL(/editor/);
  await editorReady(page);
  let s = await state(page);
  const nodes = s.nodes as unknown as N[];
  expect(nodes.some((n) => n.type === "text" && /[ހ-޿]/.test(n.text ?? ""))).toBe(true);
  expect(nodes.some((n) => n.name === "Photo frame")).toBe(true);

  // put a photo into the frame
  const frameId = nodes.find((n) => n.name === "Photo frame")!.id;
  await page.evaluate((id) => (window as unknown as { __oceanx: { store: { getState(): { select(i: string[]): void } } } }).__oceanx.store.getState().select([id]), frameId);
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click('button:has-text("Put a photo in this shape")')]);
  await chooser.setFiles({ name: "candidate.jpg", mimeType: "image/jpeg", buffer: readFileSync("tests/e2e/fixtures/photo.jpg") });
  await expect.poll(async () => ((await state(page)).nodes as unknown as N[]).some((n) => n.type === "group" && n.mask && n.children?.[1]?.type === "image")).toBe(true);

  // apply another template: page has content -> added as a new page
  await page.click('nav button:has-text("Templates")');
  await page.click('button[aria-label="Use template Season sale story"]');
  s = await state(page);
  expect(s.pages).toBe(2);
  expect((s.nodes as unknown as N[]).some((n) => n.text === "SALE")).toBe(true);

  // save as template
  await waitSaved(page);
  page.once("dialog", (d) => d.accept("My poster"));
  await page.click('button:has-text("Save this design as a template")');
  await expect(page.getByText("Saved to My templates.")).toBeVisible({ timeout: 20_000 });
  await page.click('button:has-text("My templates")');
  await expect(page.locator('button[aria-label="Use template My poster"]')).toBeVisible();
});

test("brand kit: colours, fonts and logos", async ({ page }) => {
  await signUp(page);
  await newDesign(page);
  await page.click('nav button:has-text("Brand")');
  page.once("dialog", (d) => d.accept("Ocean Party"));
  await page.click('button:has-text("Create a brand kit")');
  await expect(page.locator('select[aria-label="Brand kit"]')).toHaveValue(/.+/);
  await page.locator('input[aria-label="Add brand colour"]').fill("#ff0066");
  await expect(page.locator('button[aria-label="Apply brand colour #ff0066"]')).toBeVisible();

  // apply to a shape
  await page.click('nav button:has-text("Elements")');
  await page.click('button[aria-label="Add Square"]');
  await page.click('nav button:has-text("Brand")');
  await page.click('button[aria-label="Apply brand colour #ff0066"]');
  expect(((await state(page)).nodes[0] as unknown as N).fill?.color).toBe("#ff0066");
  // brand colours show in the fill editor
  await expect(page.locator('button[aria-label="Brand colour #ff0066"]')).toBeVisible();

  // heading font: choose, then click to add a heading in that font
  await page.keyboard.press("Escape");
  await page.click('button[aria-label="Change Heading font"]');
  await page.fill('input[aria-label="Search fonts"]', "lobster");
  await page.locator("[role=dialog] li", { hasText: /^Lobster/ }).first().locator("button").first().click();
  await expect(page.locator("[role=dialog]")).toHaveCount(0, { timeout: 30_000 });
  await page.locator("button", { hasText: "Heading" }).filter({ hasText: "Lobster" }).click();
  await expect.poll(async () => ((await state(page)).nodes as unknown as N[]).some((n) => n.type === "text" && n.fontFamily === "Lobster")).toBe(true);

  // logo
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click('aside button:has-text("Upload")')]);
  await chooser.setFiles({ name: "logo.jpg", mimeType: "image/jpeg", buffer: readFileSync("tests/e2e/fixtures/photo.jpg") });
  await page.click('button[aria-label="Add logo logo.jpg"]');
  await expect.poll(async () => ((await state(page)).nodes as unknown as N[]).filter((n) => n.type === "image").length).toBe(1);

  // the kit is stored on the server
  await page.reload(); await editorReady(page);
  await page.click('nav button:has-text("Brand")');
  await expect(page.locator('button[aria-label="Apply brand colour #ff0066"]')).toBeVisible();
  await expect(page.locator('button[aria-label="Add logo logo.jpg"]')).toBeVisible();
});

test("stroke styles: dotted, round ends", async ({ page }) => {
  await signUp(page);
  await newDesign(page);
  await page.click('button[aria-label="Add Square"]');
  await page.click('button:has-text("Add border")');
  await page.selectOption('select[aria-label="Line style"]', { label: "Dotted" });
  await page.selectOption('select[aria-label="Ends"]', "round");
  const n = (await state(page)).nodes[0] as unknown as N;
  expect(n.stroke?.dash?.[0]).toBeLessThan(0.1);
  expect(n.stroke?.cap).toBe("round");
});

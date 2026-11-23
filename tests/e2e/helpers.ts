import { expect, type Page } from "@playwright/test";

export async function signUp(page: Page) {
  await page.goto("/sign-up");
  await page.fill("input[type=email]", `e2e${Date.now()}${Math.floor(Math.random() * 1e6)}@test.mv`);
  await page.fill("input[type=password]", "secret pass 1");
  await page.click('button:has-text("Create account")');
  await page.waitForURL(/dashboard/);
}

export async function newDesign(page: Page, preset = "ig-square") {
  await page.click(`[data-preset=${preset}]`);
  await page.waitForURL(/editor/);
  await page.waitForFunction(() => (window as unknown as { __oceanx?: unknown }).__oceanx, null, { timeout: 60_000 });
  await page.waitForTimeout(500);
}

type Snap = { sel: string[]; nodes: { id: string; type: string; x: number; y: number; width: number; height: number; rotation: number; text?: string; fontSize?: number; children?: unknown[] }[]; pages: number; zoom: number; panX: number; panY: number; editing: string | null };
export function state(page: Page): Promise<Snap> {
  return page.evaluate(() => {
    const w = window as unknown as { __oceanx: { store: { getState(): { selection: string[]; pageId: string; doc: { pages: { id: string; children: unknown[] }[] } } }; ui: { getState(): { zoom: number; panX: number; panY: number; editingTextId: string | null } } } };
    const s = w.__oceanx.store.getState(), u = w.__oceanx.ui.getState();
    const page = s.doc.pages.find((p) => p.id === s.pageId)!;
    return { sel: s.selection, nodes: page.children as Snap["nodes"], pages: s.doc.pages.length, zoom: u.zoom, panX: u.panX, panY: u.panY, editing: u.editingTextId };
  });
}

/** Document coordinates -> page (screen) coordinates. */
export async function toScreen(page: Page, x: number, y: number) {
  const box = (await page.locator("[data-testid=canvas] .konvajs-content").boundingBox())!;
  const s = await state(page);
  return { x: box.x + s.panX + x * s.zoom, y: box.y + s.panY + y * s.zoom };
}

export async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(from.x + (dx * i) / 12, from.y + (dy * i) / 12);
  await page.mouse.up();
}

export async function waitSaved(page: Page) {
  await expect(page.locator("header [role=status]").first()).toHaveText(/Saved/, { timeout: 20_000 });
}

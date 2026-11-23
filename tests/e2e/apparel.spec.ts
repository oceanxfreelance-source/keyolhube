import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { signUp } from "./helpers";

type Doc = { pages: { name: string; children: N[] }[]; roster?: { name: string; number: string; size?: string }[] };
type N = { type: string; tag?: string; text?: string; fill?: { type: string; color?: string }; visible: boolean; data?: string; children?: N[] };
const docOf = (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { __oceanx: { store: { getState(): { doc: unknown } } } }).__oceanx.store.getState().doc) as Promise<Doc>;
const all = (ns: N[]): N[] => ns.flatMap((n) => (n.type === "group" ? [n, ...all(n.children ?? [])] : [n]));

test("kit: colours, pattern, roster, preview and per-player PDF", async ({ page }) => {
  await signUp(page);
  await page.click('[data-template=kit-football]');
  await page.waitForURL(/editor/);
  await page.waitForFunction(() => (window as unknown as { __oceanx?: unknown }).__oceanx, null, { timeout: 60_000 });
  await page.click('nav button:has-text("Apparel")');
  let d = await docOf(page);
  expect(d.pages.map((p) => p.name)).toEqual(["Front", "Back", "Shorts"]);

  await page.locator('input[aria-label="Kit primary colour"]').fill("#dc2626");
  await page.locator('input[aria-label="Kit accent colour"]').fill("#111111");
  await page.click('aside button:has-text("Hoops")');
  d = await docOf(page);
  const parts = d.pages.flatMap((p) => all(p.children));
  expect(parts.find((n) => n.tag === "jersey-base")?.fill?.color).toBe("#dc2626");
  expect(parts.filter((n) => n.tag === "player-number").every((n) => n.fill?.color === "#111111")).toBe(true);
  expect(parts.find((n) => n.tag === "jersey-pattern")?.data).toContain("H1000");

  await page.fill('textarea[aria-label="Paste roster"]', "Ahmed Ali, 7, M\nIbrahim, 10, L");
  await page.click('button:has-text("Add pasted players")');
  d = await docOf(page);
  expect(d.roster).toEqual([{ name: "PLAYER", number: "10", size: "M" }, { name: "Ahmed Ali", number: "7", size: "M" }, { name: "Ibrahim", number: "10", size: "L" }]);
  await page.click('button[aria-label="Preview Ahmed Ali"]');
  d = await docOf(page);
  expect(d.pages[1].children.flatMap((n) => all([n])).find((n) => n.tag === "player-name")?.text).toBe("AHMED ALI");

  const [pdf] = await Promise.all([
    page.waitForEvent("download", { timeout: 180_000 }),
    (async () => { page.once("dialog", (x) => x.accept()); await page.click('button:has-text("Export all players")'); })(),
  ]);
  const bytes = readFileSync((await pdf.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  const pdfDoc = await PDFDocument.load(bytes);
  expect(pdfDoc.getPageCount()).toBe(9); // 3 players x 3 pages
  expect(Math.round((pdfDoc.getPage(0).getWidth() / 72) * 25.4)).toBe(610); // 61 cm wide print panel
});

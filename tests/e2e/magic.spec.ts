import { expect, test } from "@playwright/test";
import path from "node:path";
import { signUp } from "./helpers";

type N = { type: string; name: string; text?: string; fontSize?: number };

test("magic layers: a flat certificate image becomes editable text over a clean background", async ({ page }) => {
  test.setTimeout(240_000);
  await signUp(page);
  const chooser = page.waitForEvent("filechooser");
  await page.click('button:has-text("Edit an image design")');
  await (await chooser).setFiles(path.join(__dirname, "fixtures/design.jpg"));
  await page.waitForURL(/editor/);
  await expect(page.locator('[role=dialog][aria-label="Magic layers"]')).toBeVisible({ timeout: 60_000 });
  await page.click('button:has-text("Make layers")');
  await expect(page.locator("[role=dialog] [role=status]", { hasText: "Done" })).toBeVisible({ timeout: 200_000 });
  await page.click('[role=dialog] button:has-text("Close")');
  const nodes = await page.evaluate(() => (window as unknown as { __oceanx: { store: { getState(): { doc: { pages: { children: N[] }[] } } } } }).__oceanx.store.getState().doc.pages[0].children);
  expect(nodes[0].type).toBe("image");
  expect(nodes[0].name).toContain("Background");
  const texts = nodes.filter((n) => n.type === "text").map((n) => n.text ?? "");
  expect(texts.some((t) => t.includes("CERTIFICATE"))).toBe(true);
  expect(texts.some((t) => /proudly presented/i.test(t))).toBe(true);
  expect(texts.some((t) => t.includes("Fathimath Hassan"))).toBe(true);
  // undo brings the original single image back
  await page.keyboard.press("Control+z");
  const after = await page.evaluate(() => (window as unknown as { __oceanx: { store: { getState(): { doc: { pages: { children: N[] }[] } } } } }).__oceanx.store.getState().doc.pages[0].children.length);
  expect(after).toBe(1);
});

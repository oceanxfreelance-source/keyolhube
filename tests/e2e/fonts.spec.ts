import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { newDesign, signUp, state, waitSaved } from "./helpers";

test("Google Fonts and uploaded fonts are applied, saved and reloaded", async ({ page }) => {
  await signUp(page);
  await newDesign(page);
  await page.click('nav button:has-text("Text")');
  await page.click('button:has-text("Add a heading")');

  // Google font
  await page.click('button[aria-label^="Font:"]');
  await page.fill('input[aria-label="Search fonts"]', "lobster");
  await page.locator("[role=dialog] li", { hasText: /^Lobster/ }).first().locator("button").first().click();
  await expect(page.locator("[role=dialog]")).toHaveCount(0, { timeout: 30_000 });
  let s = await state(page);
  expect((s.nodes[0] as unknown as { fontFamily: string }).fontFamily).toBe("Lobster");
  expect(await page.evaluate(() => document.fonts.check('400 20px "Lobster"'))).toBe(true);

  // Thaana search lists Thaana-capable fonts
  await page.click('button[aria-label^="Font:"]');
  await page.fill('input[aria-label="Search fonts"]', "ދިވެހި");
  await expect(page.locator("[role=dialog] li", { hasText: "Noto Sans Thaana" }).first()).toBeVisible();

  // Upload a font file (a real WOFF2) as a custom family
  const file = readFileSync("node_modules/@fontsource/lora/files/lora-latin-700-normal.woff2");
  await page.setInputFiles("[data-testid=font-input]", { name: "MyBrand-Bold.woff2", mimeType: "font/woff2", buffer: file });
  await expect(page.locator('input[aria-label="Font name"]')).toHaveValue("MyBrand");
  await expect(page.locator('select[aria-label="Font weight"]')).toHaveValue("700");
  await page.click('[role=dialog] button:has-text("Add")');
  await page.locator("[role=dialog] li", { hasText: "MyBrand" }).locator("button").first().click();
  await expect(page.locator("[role=dialog]")).toHaveCount(0, { timeout: 30_000 });
  s = await state(page);
  const t = s.nodes[0] as unknown as { fontFamily: string; fontWeight: number };
  expect(t.fontFamily).toBe("MyBrand");
  expect(t.fontWeight).toBe(700);
  expect(await page.evaluate(() => document.fonts.check('700 20px "MyBrand"'))).toBe(true);

  // a non-font file is refused
  await page.click('button[aria-label^="Font:"]');
  await page.setInputFiles("[data-testid=font-input]", { name: "evil.ttf", mimeType: "font/ttf", buffer: Buffer.from("<script>alert(1)</script>xxxxxxxx") });
  await page.click('[role=dialog] button:has-text("Add")');
  await expect(page.locator("[role=dialog] [role=alert]")).toContainText("Only TTF, OTF, WOFF and WOFF2");
  await page.keyboard.press("Escape");

  // persisted: reload in a fresh page, fonts load from the design
  await waitSaved(page);
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __oceanx?: unknown }).__oceanx, null, { timeout: 60_000 });
  const fonts = await page.evaluate(() => (window as unknown as { __oceanx: { store: { getState(): { doc: { fonts: { family: string }[] } } } } }).__oceanx.store.getState().doc.fonts.map((f) => f.family));
  expect(fonts).toEqual(expect.arrayContaining(["Lobster", "MyBrand"]));
  expect(await page.evaluate(() => document.fonts.check('700 20px "MyBrand"'))).toBe(true);
  // Lobster is no longer used by any text, but stays registered for the design (stylesheet linked).
  expect(await page.evaluate(() => [...document.querySelectorAll("link[rel=stylesheet]")].some((l) => (l as HTMLLinkElement).href.includes("family=Lobster")))).toBe(true);
});

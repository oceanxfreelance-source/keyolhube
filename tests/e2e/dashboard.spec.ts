import { expect, test } from "@playwright/test";
import { newDesign, signUp, waitSaved } from "./helpers";

test("dashboard: list, search, rename, duplicate, delete, thumbnails", async ({ page }) => {
  await signUp(page);
  await newDesign(page, "a4");
  await page.click('button[aria-label="Add Star"]');
  await waitSaved(page);
  const title = page.locator('input[aria-label="Design title"]');
  await title.fill("Campaign flyer");
  await title.press("Enter");
  await waitSaved(page);
  await page.waitForTimeout(4000); // first thumbnail is made ~3 s after opening
  await page.click('a[aria-label="Back to your designs"]');
  await page.waitForURL(/dashboard/);
  const card = page.locator("[data-project]", { hasText: "Campaign flyer" });
  await expect(card).toBeVisible();
  await expect(card.locator("img")).toBeVisible();
  await page.fill('input[aria-label="Search designs"]', "zzz");
  await expect(page.getByText("No designs match your search.")).toBeVisible();
  await page.fill('input[aria-label="Search designs"]', "flyer");
  await expect(card).toBeVisible();
  await card.hover();
  await card.locator('button[aria-label^="More actions"]').click();
  await page.click('button:has-text("Duplicate")');
  await expect(page.locator("[data-project]", { hasText: "Campaign flyer (copy)" })).toBeVisible();
  const copy = page.locator("[data-project]", { hasText: "Campaign flyer (copy)" });
  await copy.hover();
  await copy.locator('button[aria-label^="More actions"]').click();
  page.once("dialog", (d) => d.accept());
  await page.click('button:has-text("Delete")');
  await expect(copy).toHaveCount(0);
});

test("auth guards", async ({ page }) => {
  await page.goto("/dashboard");
  await page.waitForURL(/sign-in/);
  await page.goto("/editor/doesnotexist");
  await page.waitForURL(/sign-in/);
});

import { test, expect } from "@playwright/test";

test.describe("Pact Page (ROADMAP S-09)", () => {
  const seededPactId = "1111111111111111111111111111111111111111111111111111111111111111";

  test("loads the public pact page without error", async ({ page }) => {
    await page.goto(`/pact/${seededPactId}`);
    // Check heading containing either the pact details or not-found container
    const heading = page.locator("h1");
    await expect(heading).toBeVisible();
    await expect(page.locator("body")).toContainText("Pact");
  });

  test("renders home page and navigation links", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("Pactwright Studio");
    await expect(page.locator("text=Pact Timeline")).toBeVisible();
    await expect(page.locator("text=Certificate Viewer")).toBeVisible();
    await expect(page.locator("text=Merchant Dashboard")).toBeVisible();
    await expect(page.locator("text=Principal View")).toBeVisible();
  });
});

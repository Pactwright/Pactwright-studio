import { expect, test, type Page } from "@playwright/test";

// At phone width the header links live behind the menu button, so a test that reads them has to open it.
async function openNavMenu(page: Page) {
  const toggle = page.getByRole("button", { name: "Open navigation menu" });
  if (await toggle.isVisible()) await toggle.click();
}

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
    await expect(page.locator("h1")).toContainText("Purchases, on the record.");
    await openNavMenu(page);
    const header = page.getByRole("navigation", { name: "Studio" });
    await expect(header.getByRole("link", { name: "Ledger" })).toHaveAttribute("href", "/pacts");
    await expect(header.getByRole("link", { name: "Verify" })).toHaveAttribute("href", "/verify");
    await expect(header.getByRole("link", { name: "Sellers" })).toHaveAttribute("href", "/merchant");
    await expect(header.getByRole("link", { name: "Budgets" })).toHaveAttribute("href", "/principal");
    await expect(header.getByRole("link", { name: "Q&A" })).toHaveAttribute("href", "/#faq");
    const views = page.getByRole("heading", { name: "Three ways in" });
    await expect(views).toBeVisible();
    await expect(page.getByRole("link", { name: /The pact ledger/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /A seller's desk/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Certificate check/ })).toBeVisible();
  });

  test("form round-trip: searches pact by 64-hex id from home page (#58)", async ({ page }) => {
    await page.goto("/");
    const input = page.locator('input[name="id"]');
    await input.fill(seededPactId);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(`/pact/${seededPactId}`);
  });

  test("visits merchant dashboard and principal view (#58)", async ({ page }) => {
    await page.goto("/merchant");
    await expect(page.locator("text=Merchant Dashboard")).toBeVisible();

    await page.goto("/principal");
    await expect(page.locator("text=Principal View")).toBeVisible();
  });
});

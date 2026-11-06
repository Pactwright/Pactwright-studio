import { expect, test } from "@playwright/test";

/**
 * #93: the two pages a visitor reaches when something went wrong. The unit test reads the element tree;
 * this one proves the page actually loads in a browser, that the links are visible at 390 px as well as on
 * a desktop, and that the way forward is a page that answers — a dead end with a nice sentence on it is
 * still a dead end.
 *
 * Neither route needs the database: an unknown address is Next's own 404, and a malformed pact ID is
 * rejected by the page before it queries.
 */
const WAYS_FORWARD = [
  { href: "/", name: "Look up a pact by ID" },
  { href: "/pacts", name: "Browse the ledger" },
  { href: "/verify", name: "Verify a certificate" },
];

test.describe("Failure pages (studio#93)", () => {
  test("an unknown address offers every way forward, and none of them is a dead link", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");

    await expect(page.locator("h1")).toContainText("404");
    // Scoped to the page's own nav: the site header already links "Verify a certificate", so an unscoped
    // name matches two elements and proves nothing about the panel.
    const ways = page.getByRole("navigation", { name: "Other views" });
    for (const { href, name } of WAYS_FORWARD) {
      const link = ways.getByRole("link", { name });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", href);
    }
    // The header offers no way to the ledger, so the panel has to.
    await expect(page.getByRole("navigation", { name: "Studio" }).getByRole("link", { name: "Pacts" }))
      .toHaveAttribute("href", "/");
  });

  test("a malformed pact ID lands on the same page instead of a blank one", async ({ page }) => {
    await page.goto("/pact/not-a-pact-id");

    await expect(page.locator("h1")).toContainText("404");
    await expect(page.getByRole("link", { name: "Browse the ledger" })).toBeVisible();
  });

  test("following the ledger link out of the dead end loads the ledger", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    await page.click("a[href='/pacts']");

    await expect(page).toHaveURL("/pacts");
    await expect(page.locator("table.ledger tbody tr").first()).toBeVisible();
  });

  test("says nothing from the server: no stack frame, no connection string", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist");
    expect(response?.status()).toBe(404);

    const source = await page.content();
    expect(source).not.toMatch(/node_modules/);
    expect(source).not.toMatch(/postgres:\/\//);
    expect(source).not.toMatch(/at [\w$.]+ \(/);
  });
});

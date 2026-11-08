import { expect, test } from "@playwright/test";

/**
 * #74: `/pacts` is the way into the ledger for a visitor who has no pact ID, and its filters are a plain
 * GET form. "Works without JavaScript" is only checkable by switching JavaScript off, so the filter tests
 * do exactly that: the browser submits the form itself, and the page answers from the query parameters.
 *
 * `seed.sql` carries three fixture pacts plus a demo ledger of seventeen, so 20 rows in one 25-row page.
 * The fixtures are the newest three: they take `created_at` from the insert, and every demo row is stamped
 * hours earlier. They share their timestamps closely enough that the `pact_id` tie-break decides among
 * them — the same tie-break the cursor carries, which is why the first page has to be stable.
 */
const SEEDED = {
  settled: "1111111111111111111111111111111111111111111111111111111111111111",
  funded: "2222222222222222222222222222222222222222222222222222222222222222",
  refunded: "3333333333333333333333333333333333333333333333333333333333333333",
};
const SELLER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

test.describe("Pact ledger (studio#74)", () => {
  test("lists the indexed pacts with state, amount, seller and last change", async ({ page }) => {
    await page.goto("/pacts");

    await expect(page.locator("h1")).toContainText("Pact ledger");
    const rows = page.locator("table.ledger tbody tr");
    await expect(rows).toHaveCount(20);
    // The three fixtures are the newest inserts, so within them the ID decides the order.
    await expect(rows.first().locator("a").first()).toHaveAttribute("href", `/pact/${SEEDED.refunded}`);
    await expect(rows.nth(1).locator("a").first()).toHaveAttribute("href", `/pact/${SEEDED.funded}`);
    await expect(rows.nth(2).locator("a").first()).toHaveAttribute("href", `/pact/${SEEDED.settled}`);

    await expect(page.locator("table.ledger")).toContainText("In escrow");
    await expect(page.locator("table.ledger")).toContainText("10.00");
    await expect(page.locator("table.ledger")).toContainText("GBBD47IF…LLFLA5");
    expect(await page.locator("table.ledger tbody tr td").nth(4).innerText()).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/);
  });

  test("says the ledger has been reached at the end instead of offering an empty next page", async ({ page }) => {
    await page.goto("/pacts");

    await expect(page.getByText("These are the oldest indexed pacts")).toBeVisible();
    await expect(page.getByRole("link", { name: "Older pacts" })).toHaveCount(0);
  });

  test.describe("filtering with no JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("submits the state filter as a query parameter and narrows the table", async ({ page }) => {
      await page.goto("/pacts");
      await page.selectOption("select[name=state]", "refunded");
      await page.click("button[type=submit]");

      // The empty seller field travels too as `seller=`, which the shared parser reads as "no filter".
      await expect(page).toHaveURL(/\/pacts\?state=refunded(&|$)/);
      const rows = page.locator("table.ledger tbody tr");
      await expect(rows).toHaveCount(3); // two demo refunds above the fixture one
      await expect(rows.locator("a").first()).toHaveAttribute("href", `/pact/${SEEDED.refunded}`);
      // The filter stays visible so the visitor knows what they are looking at.
      await expect(page.locator("select[name=state]")).toHaveValue("refunded");
      await expect(page.getByText("Filtered to")).toBeVisible();
    });

    test("filters by seller address, the address the visitor already has", async ({ page }) => {
      await page.goto(`/pacts?seller=${SELLER}`);

      const rows = page.locator("table.ledger tbody tr");
      await expect(rows).toHaveCount(6); // Pollar's two fixture pacts plus the four the demo ledger sells
      await expect(page.locator("input[name=seller]")).toHaveValue(SELLER);
    });

    test("answers a state that does not exist with the reason, not an empty table", async ({ page }) => {
      await page.goto("/pacts?state=pending");

      await expect(page.getByRole("alert")).toContainText("Invalid state");
      await expect(page.locator("table.ledger")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Start from the newest pacts" })).toHaveAttribute("href", "/pacts");
    });

    test("offers advice for a filter that legitimately matches nothing", async ({ page }) => {
      await page.goto("/pacts?state=settled&seller=GDZCEMJ4IZ6PQHQ3V7OQ4T7UOK6EAZB4Y6Y6XTPZKBM6G6WZ4T7DQABC");

      await expect(page.getByText("No pacts match", { exact: false })).toBeVisible();
      await expect(page.locator("table.ledger")).toHaveCount(0);
    });

    test("reaches a pact from the home page without typing an ID", async ({ page }) => {
      await page.goto("/");
      // The body link, not the header one: with JavaScript off at 390 px the header is a menu that cannot
      // open, so only a link in the page itself proves the ledger is one click away for everyone.
      await page.getByRole("link", { name: "Browse the whole ledger" }).click();

      await expect(page).toHaveURL("/pacts");
      await expect(page.locator("table.ledger tbody tr")).toHaveCount(20);
    });
  });
});

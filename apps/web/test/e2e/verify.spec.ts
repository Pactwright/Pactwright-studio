import { test, expect } from "@playwright/test";

test.describe("Certificate Viewer (ROADMAP S-09)", () => {
  test("verifies valid and tampered certificates interactively", async ({ page }) => {
    await page.goto("/verify");
    await expect(page.locator("h1")).toContainText("Verify Certificate");

    const textarea = page.locator("textarea");
    const inspectButton = page.locator('button:has-text("Inspect & Verify")');

    // 1. Inspect a valid certificate
    const validCert = JSON.stringify({
      pactId: "1111111111111111111111111111111111111111111111111111111111111111",
      transition: "settled",
      toSeller: "10.0000000",
      toBuyer: "0.0000000",
      status: "anchored",
      leaf: "1111111111111111111111111111111111111111111111111111111111111111",
      root: "1111111111111111111111111111111111111111111111111111111111111111",
      proof: [],
    });

    await textarea.fill(validCert);
    await inspectButton.click();

    const badge = page.locator('[data-testid="verification-badge"]');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("Verified (Offline Merkle Proof)");

    // 2. Inspect a tampered certificate
    const tamperedCert = JSON.stringify({
      pactId: "1111111111111111111111111111111111111111111111111111111111111111",
      transition: "settled",
      toSeller: "10.0000000",
      toBuyer: "0.0000000",
      status: "anchored",
      leaf: "1111111111111111111111111111111111111111111111111111111111111111",
      root: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      proof: [],
    });

    await textarea.fill(tamperedCert);
    await inspectButton.click();

    await expect(badge).toContainText("Invalid Merkle Proof");
  });
});

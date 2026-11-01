import { test, expect } from "@playwright/test";

test.describe("Certificate Viewer (ROADMAP S-07, S-09, #55)", () => {
  test("verifies valid, anchored, offline-consistent, and tampered certificates interactively", async ({ page }) => {
    await page.goto("/verify");
    await expect(page.locator("h1")).toContainText("Verify Certificate");

    const textarea = page.locator("textarea");
    const inspectButton = page.locator('button:has-text("Inspect & Verify")');

    // 1. Inspect an offline-consistent certificate (valid Merkle proof against root, but pending on-chain)
    const offlineCert = JSON.stringify({
      pactId: "1111111111111111111111111111111111111111111111111111111111111111",
      transition: "settled",
      toSeller: "10.0000000",
      toBuyer: "0.0000000",
      status: "pending",
      leaf: "1111111111111111111111111111111111111111111111111111111111111111",
      root: "5189c77d29fe5d546a045ec46986852785fea5c13ac7da9c115ff5fb6edf817c",
      proof: ["2222222222222222222222222222222222222222222222222222222222222222"],
    });

    await textarea.fill(offlineCert);
    await inspectButton.click();

    const badge = page.locator('[data-testid="verification-badge"]');
    const onchainBadge = page.locator('[data-testid="onchain-badge"]');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("Consistent with this root (Offline Merkle Proof)");
    await expect(onchainBadge).toContainText("Pending Anchor");

    // 2. Inspect an anchored and on-chain verified certificate
    const anchoredCert = JSON.stringify({
      pactId: "1111111111111111111111111111111111111111111111111111111111111111",
      transition: "settled",
      toSeller: "10.0000000",
      toBuyer: "0.0000000",
      status: "anchored",
      batchId: 42,
      anchorTx: "abababababababababababababababababababababababababababababababab",
      anchoredLedger: 50000100,
      onChainVerified: true,
      leaf: "1111111111111111111111111111111111111111111111111111111111111111",
      root: "5189c77d29fe5d546a045ec46986852785fea5c13ac7da9c115ff5fb6edf817c",
      proof: ["2222222222222222222222222222222222222222222222222222222222222222"],
    });

    await textarea.fill(anchoredCert);
    await inspectButton.click();

    await expect(badge).toContainText("Consistent with this root (Offline Merkle Proof)");
    await expect(onchainBadge).toContainText("Anchored on chain, seen at ledger 50000100");
    await expect(page.locator('[data-testid="batch-id"]')).toContainText("#42");

    // 3. Inspect an unverifiable tampered certificate (invalid Merkle proof)
    const tamperedCert = JSON.stringify({
      pactId: "1111111111111111111111111111111111111111111111111111111111111111",
      transition: "settled",
      toSeller: "10.0000000",
      toBuyer: "0.0000000",
      status: "anchored",
      batchId: 42,
      leaf: "1111111111111111111111111111111111111111111111111111111111111111",
      root: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      proof: [],
    });

    await textarea.fill(tamperedCert);
    await inspectButton.click();

    await expect(badge).toContainText("Invalid Merkle Proof");
    await expect(onchainBadge).toContainText("Unverifiable on-chain");

    // 4. Inspect a certificate with leaf mismatch
    const leafMismatchCert = JSON.stringify({
      pactId: "1111111111111111111111111111111111111111111111111111111111111111",
      transition: "settled",
      toSeller: "10.0000000",
      toBuyer: "0.0000000",
      status: "anchored",
      leaf: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      leafInput: {
        transition: "settled",
        toSellerStroops: "100000000",
        toBuyerStroops: "0",
        envelopeHash: null,
        ledger: 100,
      },
      root: "5189c77d29fe5d546a045ec46986852785fea5c13ac7da9c115ff5fb6edf817c",
      proof: [],
    });

    await textarea.fill(leafMismatchCert);
    await inspectButton.click();

    await expect(badge).toContainText("Leaf Mismatch");
    await expect(page.locator('[data-testid="leaf-mismatch-alert"]')).toBeVisible();
  });

  test("loads certificate from URL query parameter /verify?id=<leaf|pact>", async ({ page }) => {
    await page.goto("/verify?id=1111111111111111111111111111111111111111111111111111111111111111");
    await expect(page.locator("h1")).toContainText("Verify Certificate");

    const badge = page.locator('[data-testid="verification-badge"]');
    await expect(badge).toBeVisible();

    const textarea = page.locator("textarea");
    await expect(textarea).not.toHaveValue("");
    await expect(textarea).toContainText("1111111111111111111111111111111111111111111111111111111111111111");
  });
});

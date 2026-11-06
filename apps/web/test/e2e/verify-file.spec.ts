import { test, expect } from "@playwright/test";

/**
 * #86 — `/verify` takes a certificate from a file: chosen or dropped, read in this browser,
 * at most one `.json` of at most 256 KiB, and with the reason shown next to the input when it is
 * not one. The certificate below is pending, so any POST that leaves the browser is an upload.
 */
const LEAF = "1111111111111111111111111111111111111111111111111111111111111111";
const ROOT = "5189c77d29fe5d546a045ec46986852785fea5c13ac7da9c115ff5fb6edf817c";
const SIBLING = "2222222222222222222222222222222222222222222222222222222222222222";

const certificate = {
  pactId: LEAF,
  transition: "settled",
  toSeller: "10.0000000",
  toBuyer: "0.0000000",
  status: "pending",
  leaf: LEAF,
  root: ROOT,
  proof: [SIBLING],
};

const tampered = {
  ...certificate,
  leaf: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  leafInput: {
    transition: "settled",
    toSellerStroops: "100000000",
    toBuyerStroops: "0",
    envelopeHash: null,
    ledger: 100,
  },
};

test.describe("Loading a certificate from a file (studio#86)", () => {
  test("choosing the file verifies it, and nothing is uploaded", async ({ page }) => {
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET") posts.push(`${request.method()} ${request.url()}`);
    });

    await page.goto("/verify");
    const input = page.locator("#certificate-file");
    const text = JSON.stringify(certificate);
    await input.setInputFiles({ name: "receipt.json", mimeType: "application/json", buffer: Buffer.from(text) });

    await expect(page.getByTestId("file-loaded")).toContainText("Loaded receipt.json");
    await expect(page.getByTestId("file-loaded")).toContainText("nothing was uploaded");
    await expect(page.getByTestId("verification-badge")).toContainText("Consistent with this root");
    // The paste box shows exactly what was read, so the visitor can see what was checked.
    await expect(page.locator("#certificate-json")).toHaveValue(text);
    expect(posts, `a pending certificate must not send anything: ${posts.join(", ")}`).toEqual([]);
  });

  test("a certificate its own inputs do not describe is flagged, from a file as from a paste", async ({ page }) => {
    await page.goto("/verify");
    await page.locator("#certificate-file").setInputFiles({
      name: "altered.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(tampered)),
    });
    await expect(page.getByTestId("verification-badge")).toContainText("Leaf Mismatch");
    await expect(page.getByTestId("leaf-mismatch-alert")).toBeVisible();
  });

  test("a file over the limit is refused from its size, before it is read", async ({ page }) => {
    await page.goto("/verify");
    await page.locator("#certificate-file").setInputFiles({
      name: "huge.json",
      mimeType: "application/json",
      buffer: Buffer.alloc(300 * 1024, 0x20),
    });
    const note = page.getByTestId("file-error");
    await expect(note).toContainText("huge.json");
    await expect(note).toContainText("300 KiB");
    await expect(note).toContainText("at most 256 KiB");
    await expect(page.locator(".certificate-result")).toHaveCount(0);
    await expect(page.getByTestId("file-loaded")).toHaveCount(0);
  });

  test("a broken file names itself and the reason, next to the input", async ({ page }) => {
    await page.goto("/verify");
    await page.locator("#certificate-file").setInputFiles({
      name: "half.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(certificate).slice(0, 40)),
    });
    const note = page.getByTestId("file-error");
    await expect(note).toContainText("half.json");
    await expect(note).toContainText("isn't valid JSON");
    await expect(note).toHaveAttribute("role", "alert");
    await expect(page.locator("#certificate-file")).toHaveAttribute("aria-describedby", "certificate-file-note");
    await expect(page.locator(".certificate-result")).toHaveCount(0);
  });

  test("something that is not a certificate file is refused by name", async ({ page }) => {
    await page.goto("/verify");
    await page.locator("#certificate-file").setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(JSON.stringify(certificate)),
    });
    await expect(page.getByTestId("file-error")).toContainText("notes.txt isn't a .json file");
    await expect(page.locator(".certificate-result")).toHaveCount(0);
  });

  test("a dropped file goes through the same door as a chosen one", async ({ page }) => {
    await page.goto("/verify");
    await page.evaluate((body) => {
      const drop = new DataTransfer();
      drop.items.add(new File([body], "dropped.json", { type: "application/json" }));
      document.querySelector('[data-testid="certificate-dropzone"]')?.dispatchEvent(
        new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: drop })
      );
    }, JSON.stringify(certificate));
    await expect(page.getByTestId("file-loaded")).toContainText("Loaded dropped.json");
    await expect(page.getByTestId("verification-badge")).toContainText("Consistent with this root");
  });

  test("the control is reached with the keyboard, not only with a mouse", async ({ page }) => {
    await page.goto("/verify");
    let reached = false;
    for (let i = 0; i < 12 && !reached; i++) {
      await page.keyboard.press("Tab");
      reached = await page.evaluate(() => document.activeElement?.id === "certificate-file");
    }
    expect(reached, "Tab from the top of the page must land on the file input").toBe(true);
    // A focused file input opens the OS picker on Enter or Space; that is the keyboard path.
    await expect(page.locator("#certificate-file")).toBeFocused();
    await expect(page.getByLabel(/load a certificate file/i)).toBeVisible();
  });

  test("a certificate with nothing to hash pulls in no hashing code", async ({ page }) => {
    const scripts: string[] = [];
    page.on("request", (request) => {
      if (/\.js(\?|$)/.test(request.url())) scripts.push(request.url());
    });
    await page.goto("/verify");
    const atLoad = new Set(scripts);

    await page.locator("#certificate-file").setInputFiles({
      name: "bare.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ pactId: LEAF, transition: "settled", toSeller: "10.0000000", toBuyer: "0.0000000", status: "pending", leaf: LEAF })),
    });
    await expect(page.getByTestId("verification-badge")).toContainText("Invalid Merkle Proof");

    const carriers: string[] = [];
    for (const url of new Set(scripts.filter((s) => !atLoad.has(s)))) {
      const body = await page.request.get(url).then((res) => res.text()).catch(() => "");
      // The domain separator is a string only `lib/verify` writes, so it marks the crypto chunk.
      if (body.includes("pactwright-receipt-v1")) carriers.push(url);
    }
    expect(carriers, "no proof to check means no hashing module to fetch").toEqual([]);
  });

  test("the hashing code arrives only when a proof has to be checked", async ({ page }) => {
    const scripts: string[] = [];
    page.on("request", (request) => {
      if (/\.js(\?|$)/.test(request.url())) scripts.push(request.url());
    });
    await page.goto("/verify");
    const atLoad = new Set(scripts);

    await page.locator("#certificate-file").setInputFiles({
      name: "receipt.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(certificate)),
    });
    await expect(page.getByTestId("verification-badge")).toContainText("Consistent with this root");

    const carriers: string[] = [];
    for (const url of new Set(scripts.filter((s) => !atLoad.has(s)))) {
      const body = await page.request.get(url).then((res) => res.text()).catch(() => "");
      if (body.includes("pactwright-receipt-v1")) carriers.push(url);
    }
    expect(carriers.length, "the offline check still needs the hashing module, on demand").toBe(1);
  });

  test("choosing a second file replaces the first, and the old result cannot survive it", async ({ page }) => {
    await page.goto("/verify");
    await page.locator("#certificate-file").setInputFiles({
      name: "one.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(certificate)),
    });
    await expect(page.getByTestId("verification-badge")).toContainText("Consistent with this root");
    await page.locator("#certificate-file").setInputFiles({
      name: "two.json",
      mimeType: "application/json",
      buffer: Buffer.from("not json at all"),
    });
    await expect(page.getByTestId("file-error")).toContainText("two.json");
    await expect(page.getByTestId("file-loaded")).toHaveCount(0);
    await expect(page.locator(".certificate-result")).toHaveCount(0);
  });
});

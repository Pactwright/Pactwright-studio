import { test, expect } from "@playwright/test";
import { Keypair } from "@stellar/stellar-sdk";

/**
 * #88 — a seller row used to exist only because `seed.sql` said so. This walks the two-step form a
 * real seller would use: Studio records what it wants signed, the seller signs that text with their
 * account's secret key, and only then does the row appear. Signatures are made here, in the test, with
 * the same SDK Studio verifies against, so a green run is proof the check has teeth.
 */
function newSeller() {
  const keypair = Keypair.random();
  return {
    keypair,
    address: keypair.publicKey(),
    name: `Playwright Seller ${keypair.publicKey().slice(1, 7)}`,
    deliveryKey: Keypair.random().rawPublicKey().toString("hex"),
    vault: "CAN4XKE3YUTQDPF6A3VCUWGITJSE53FWQRRSRXMS5PCG4LFVUMNIXMYX",
  };
}

/**
 * Submits step 1. `challenge` says which outcome the caller expects, because the refusal path and the
 * success path render different pages and a helper that waits for the wrong one hides the bug it is
 * supposed to be testing.
 */
async function fillDetails(page: import("@playwright/test").Page, seller: ReturnType<typeof newSeller>, challenge = true) {
  await page.goto("/merchant/register");
  await page.locator("#address").fill(seller.address);
  await page.locator("#name").fill(seller.name);
  await page.locator("#delivery-key").fill(seller.deliveryKey);
  await page.locator("#refund-vault").fill(seller.vault);
  await page.getByRole("button", { name: /ask for a challenge/i }).click();
  await expect(page.locator("#challenge-payload")).toBeVisible(challenge ? { timeout: 5_000 } : { visible: false });
}

async function tokenAndPayload(page: import("@playwright/test").Page) {
  return {
    token: await page.locator('input[name="token"]').inputValue(),
    payload: await page.locator("#challenge-payload").inputValue(),
  };
}

async function submitSignature(page: import("@playwright/test").Page, signature: string) {
  await page.locator("#signature").fill(signature);
  await page.getByRole("button", { name: /register the seller/i }).click();
}

const hexOf = (keypair: Keypair, payload: string) => keypair.signMessage(Buffer.from(payload, "utf8")).toString("hex");

/**
 * Where step 2 posts and every field the server-rendered form carries, read off the DOM.
 *
 * These are taken from the page rather than written down here on purpose. Next identifies a server
 * action with its own hidden fields (`$ACTION_REF_`, `$ACTION_1:0/1`, `$ACTION_KEY`), React rewrites the
 * form's `action` to a `javascript:throw` placeholder once it hydrates, and a test that hard-coded any
 * of it would be testing its own transcription. So the caller runs with JavaScript switched off — the
 * markup is then exactly what a no-JS browser, and an attacker with `curl`, posts.
 */
async function stepTwoAction(page: import("@playwright/test").Page) {
  const form = page.locator('[data-testid="register-confirm"]');
  await expect(form, "step 2 must be rendered server-side for this to be a real submission").toHaveCount(1);
  const action = (await form.getAttribute("action")) ?? "";
  expect(await form.getAttribute("method"), "step 2 must post, not get").toBe("POST");
  expect(await form.getAttribute("enctype"), "the replay is posted the way the browser encodes it").toBe("multipart/form-data");
  // Next serves the enhanced form with an empty `action`, which means the URL the page came from; React
  // then rewrites it to a `javascript:throw` placeholder on hydration. The caller runs with JavaScript
  // off, so an empty action here is the door — and a `javascript:` one would mean the test is lying.
  expect(action, "a server-rendered step 2 form posts to its own URL").not.toContain("javascript:");
  const hidden = await form.locator("input[type=hidden]").evaluateAll((els) =>
    els.map((el) => [(el as HTMLInputElement).name, (el as HTMLInputElement).value]),
  );
  const url = new URL(action, page.url());
  const fields = Object.fromEntries(hidden) as Record<string, string>;
  const nextOwn = Object.keys(fields).filter((name) => name.startsWith("$"));
  expect(nextOwn.length, "the form must carry Next's server action fields, or there is nothing to post to").toBeGreaterThan(0);
  return {
    url: url.toString(),
    fields,
    mine: Object.keys(fields).filter((name) => !name.startsWith("$")).sort(),
    /**
     * Post the way this form's own submission would, Origin included: Next forwards a server action from
     * a request with no `Origin` header with a warning, and a test that leaned on that would be testing a
     * request no browser makes.
     */
    post: (extra: Record<string, string>) =>
      page.request.post(url.toString(), {
        headers: { origin: url.origin },
        multipart: { ...fields, ...extra },
      }),
  };
}

/** A context with JavaScript switched off, which is how a step 2 replay is reached without a browser. */
async function withoutJavaScript(browser: import("@playwright/test").Browser) {
  const context = await browser.newContext({ javaScriptEnabled: false });
  return { context, page: await context.newPage() };
}

test.describe("Registering a seller with a signature (studio#88)", () => {
  test("a signature over the challenge Studio issued registers the seller", async ({ page }) => {
    const seller = newSeller();
    await fillDetails(page, seller);
    const { payload } = await tokenAndPayload(page);
    expect(payload).toContain(`account: ${seller.address}`);
    expect(payload).toContain(`name: ${seller.name}`);
    expect(payload).toContain(`delivery key: ${seller.deliveryKey}`);
    expect(payload).toContain(`refund vault: ${seller.vault}`);

    await submitSignature(page, hexOf(seller.keypair, payload));
    const done = page.getByTestId("registered-notice");
    await expect(done).toContainText(seller.name);
    await expect(done).toContainText("Nothing here moved funds");

    // The dashboard is the reason the row exists: it must now find this seller by address.
    await page.goto(`/merchant?seller=${seller.address}`);
    await expect(page.locator("h1")).toContainText(seller.name);
  });

  test("a signature from a different account proves nothing and registers nobody", async ({ page }) => {
    const seller = newSeller();
    const imposter = Keypair.random();
    await fillDetails(page, seller);
    const { payload } = await tokenAndPayload(page);

    await submitSignature(page, hexOf(imposter, payload));
    const error = page.getByTestId("register-error");
    await expect(error).toContainText("does not prove control");
    await expect(error).toHaveAttribute("role", "alert");
    await expect(page.getByTestId("registered-notice")).toHaveCount(0);

    await page.goto(`/merchant?seller=${seller.address}`);
    await expect(page.locator("h1")).not.toContainText(seller.name);
  });

  test("one account cannot register twice, so a captured challenge has nowhere to land", async ({ page }) => {
    const seller = newSeller();
    await fillDetails(page, seller);
    const first = await tokenAndPayload(page);
    await submitSignature(page, hexOf(seller.keypair, first.payload));
    await expect(page.getByTestId("registered-notice")).toContainText(seller.name);

    // Coming back for the same account, Studio refuses at the first step. The token-level replay —
    // the identical token and signature posted twice — is enforced by the conditional UPDATE and is
    // pinned in test/unit/merchant-registration.test.ts, including two submissions at once.
    await fillDetails(page, seller, false);
    await expect(page.getByTestId("register-error")).toContainText(/already registered/i);
    await expect(page.locator("#challenge-payload")).toHaveCount(0); // the second attempt never became a challenge
  });

  test("the same challenge, posted twice with its own valid signature, registers one seller", async ({ browser }) => {
    const { context, page } = await withoutJavaScript(browser);
    const seller = newSeller();
    await fillDetails(page, seller);
    const { token, payload } = await tokenAndPayload(page);
    const signature = hexOf(seller.keypair, payload);

    // Step 2 is a plain form, so a replay can be posted through the same door a browser uses: the URL
    // Next rendered and every hidden field that form carries, with the captured token and signature.
    const action = await stepTwoAction(page);
    expect(action.mine, "step 2's own hidden fields are the challenge and which step this is").toEqual(["step", "token"]);
    const post = () => action.post({ token, signature });

    const first = await post();
    expect(first.status(), "the first submission must not error").toBeLessThan(500);
    expect(await first.text(), "the first submission registered the seller").toContain("Nothing here moved funds");

    const replay = await post();
    expect(await replay.text(), "a spent challenge must not pass as a fresh one").toContain("already used");
    expect(replay.status()).toBeLessThan(500);
    await context.close();
  });

  test("a request that restates the seller is registered under what the challenge recorded", async ({ browser }) => {
    const { context, page } = await withoutJavaScript(browser);
    const seller = newSeller();
    await fillDetails(page, seller);
    const { token, payload } = await tokenAndPayload(page);

    // The signed text is the only place a name can come from, so the fields beside it are ignored — but
    // the page must not be the one that decides that. This is the request a browser never sends: the
    // same form, with a different name and a different `payload` pasted into it, and a signature over
    // the text Studio actually recorded.
    const action = await stepTwoAction(page);
    const sent = await page
      .locator('[data-testid="register-confirm"] input, [data-testid="register-confirm"] textarea')
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute("name")).filter((name): name is string => !!name && !name.startsWith("$")).sort(),
      );
    expect(sent, "step 2 accepts the challenge and the signature, and nothing the seller can restate").toEqual([
      "signature",
      "step",
      "token",
    ]);

    const response = await action.post({
      token,
      signature: hexOf(seller.keypair, payload),
      name: "Renamed by whoever sent this",
      delivery_key: Keypair.random().rawPublicKey().toString("hex"),
      refund_vault: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAANDA",
      payload: "Pactwright seller registration\naccount: GD7777777777777777777777777777777777777777777777777M7V\nname: Someone else",
    });
    expect(response.status()).toBeLessThan(500);
    const body = await response.text();
    expect(body, `the recorded name must be what registers: ${body.slice(0, 400)}`).toContain(seller.name);
    expect(body).not.toContain("Renamed by whoever sent this");

    await page.goto(`/merchant?seller=${seller.address}`);
    await expect(page.locator("h1")).toContainText(seller.name);

    // A second challenge, refused on purpose, to see what step 2 shows afterwards: the request carries a
    // `payload` of its own, and the page must still print the text Studio recorded for that token — the
    // seller cannot be told to sign something Studio never asked for.
    const other = newSeller();
    await fillDetails(page, other);
    const second = await stepTwoAction(page);
    const refused = await second.post({
      signature: hexOf(Keypair.random(), "text nobody recorded"),
      payload: "Pactwright seller registration\naccount: GD7777777777777777777777777777777777777777777777777M7V\nname: Someone else",
    });
    const refusedBody = await refused.text();
    expect(refusedBody, `a refused signature must still name the account: ${refusedBody.slice(0, 300)}`).toContain("does not prove control");
    expect(refusedBody).toContain(other.address);
    expect(refusedBody, "the page shows the recorded challenge, not the one the request sent").toContain(
      `challenge: ${second.fields.token}`,
    );
    expect(refusedBody).not.toContain("Someone else");

    // A request that claims the other step does not skip its checks: with `step: "details"` this is
    // simply a step 1 submission, and step 1 needs an address.
    const wrongStep = await action.post({ step: "details", token, signature: hexOf(seller.keypair, payload) });
    expect(wrongStep.status()).toBeLessThan(500);
    expect(await wrongStep.text(), "claiming step 1 without step 1's fields is refused by step 1").toContain(
      "is not a Stellar account address",
    );
    await context.close();
  });

  test("an address that is not a Stellar account never reaches a challenge", async ({ page }) => {
    await page.goto("/merchant/register");
    await page.locator("#address").fill("GBBD47IF");
    await page.locator("#name").fill("Half Written");
    await page.locator("#delivery-key").fill(Keypair.random().rawPublicKey().toString("hex"));
    await page.getByRole("button", { name: /ask for a challenge/i }).click();

    const error = page.getByTestId("register-error");
    await expect(error).toContainText("is not a Stellar account address");
    await expect(error).toHaveAttribute("role", "alert");
    await expect(page.locator("#challenge-payload")).toHaveCount(0);
    // The refusal points the input that caused it.
    await expect(page.locator("#address")).toHaveAttribute("aria-describedby", "register-error");
  });

  test("a vault that is not a contract is refused by name", async ({ page }) => {
    const seller = newSeller();
    await page.goto("/merchant/register");
    await page.locator("#address").fill(seller.address);
    await page.locator("#name").fill(seller.name);
    await page.locator("#delivery-key").fill(seller.deliveryKey);
    await page.locator("#refund-vault").fill(seller.address);
    await page.getByRole("button", { name: /ask for a challenge/i }).click();
    await expect(page.getByTestId("register-error")).toContainText("is not a contract address");
  });

  test("the form works with JavaScript switched off", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const seller = newSeller();
    await page.goto("/merchant/register");
    await page.locator("#address").fill(seller.address);
    await page.locator("#name").fill(seller.name);
    await page.locator("#delivery-key").fill(seller.deliveryKey);
    await page.locator("#refund-vault").fill(seller.vault);
    await page.getByRole("button", { name: /ask for a challenge/i }).click();
    await expect(page.locator("#challenge-payload")).toBeVisible();

    const payload = await page.locator("#challenge-payload").inputValue();
    await page.locator("#signature").fill(hexOf(seller.keypair, payload));
    await page.getByRole("button", { name: /register the seller/i }).click();
    await expect(page.getByTestId("registered-notice")).toContainText(seller.name);
    await context.close();
  });
});

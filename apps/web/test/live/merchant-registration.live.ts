/**
 * Live registration: the real database, real keys, nothing stubbed. ROADMAP P7-21, studio#88.
 *
 * `test/unit/merchant-registration.test.ts` proves the flow against a fake that reimplements two
 * Postgres behaviours — a primary key and a conditional UPDATE. That is where its blind spot is: a
 * fake enforces the rules its author believed, so it cannot show that the SQL actually enforces them.
 * The single-use guarantee is the one claim in this feature that a concurrency bug would silently
 * defeat (two requests both registering, or neither), so it is measured here against Postgres itself.
 * `pnpm test` never runs this file.
 *
 * It writes only rows it creates from freshly generated accounts, and deletes exactly those.
 *
 *   DATABASE_URL=postgres://… pnpm --filter web live:testnet
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { db } from "@/lib/db";
import {
  buildRegistrationPayload,
  claimRegistrationChallenge,
  completeSellerRegistration,
  issueRegistrationChallenge,
  type SellerRegistration,
} from "@/app/(merchant)/merchant/register/registration";

const enabled = Boolean(process.env.DATABASE_URL);

interface Account {
  registration: SellerRegistration;
  keypair: Keypair;
}

const accounts: Account[] = [];
const tokens: string[] = [];

/** A seller as the form would send it, with an account nobody else holds. */
function newAccount(): Account {
  const keypair = Keypair.random();
  const registration: SellerRegistration = {
    address: keypair.publicKey(),
    name: `Live registration probe ${keypair.publicKey().slice(1, 8)}`,
    deliveryKey: Keypair.random().rawPublicKey().toString("hex"),
    refundVault: null,
  };
  accounts.push({ registration, keypair });
  return accounts[accounts.length - 1];
}

function sign(account: Account, payload: string): string {
  return account.keypair.signMessage(Buffer.from(payload, "utf8")).toString("hex");
}

async function issued(account: Account): Promise<{ token: string; payload: string }> {
  const result = await issueRegistrationChallenge(account.registration);
  if (!result.ok) throw new Error(`challenge issue refused on a live database: ${result.message}`);
  tokens.push(result.value.token);
  return result.value;
}

async function row(sql: string, params: unknown[] = []): Promise<any> {
  const res = await db().query(sql, params);
  return res.rows[0];
}

describe.runIf(enabled)("a registration challenge, against Postgres", () => {
  beforeAll(async () => {
    // Fails loudly rather than testing an un-migrated schema.
    const table = await row(
      "select 1 from information_schema.tables where table_schema = 'public' and table_name = 'registration_challenges'"
    );
    expect(table, "run pnpm db:migrate — registration_challenges does not exist").toBeTruthy();
  });

  afterAll(async () => {
    for (const account of accounts) {
      await db().query("delete from sellers where address = $1", [account.registration.address]);
    }
    for (const token of tokens) {
      await db().query("delete from registration_challenges where token = $1", [token]);
    }
  });

  it("registers the seller with the values the challenge recorded, read back as Postgres types", async () => {
    const account = newAccount();
    const { token, payload } = await issued(account);
    const done = await completeSellerRegistration(token, sign(account, payload));
    expect(done.ok, `live completion refused: ${(done as any).message}`).toBe(true);

    const seller = await row("select address, name, delivery_key, refund_vault from sellers where address = $1", [
      account.registration.address,
    ]);
    expect(seller.name).toBe(account.registration.name);
    // `delivery_key` is char(64): Postgres pads to n and the driver hands back the value, so a hex key
    // must come out identical to what went in. A fake never checks this and a padded column can.
    expect(seller.delivery_key.trim()).toBe(account.registration.deliveryKey);
    expect(seller.refund_vault).toBeNull();

    // The flags in step two's SELECT are Postgres expressions, and `pg` must answer them as booleans.
    // A string "false" would make every spent challenge look fresh, which no mocked query can show.
    const spent = await row(
      `select (consumed_at is not null) as consumed, (expires_at <= now()) as expired
         from registration_challenges where token = $1`,
      [token]
    );
    expect(spent.consumed).toBe(true);
    expect(spent.expired).toBe(false);
    // The challenge is kept after use, as the migration says it must be: it is the audit of an attempt.
    expect(await row("select issued_at from registration_challenges where token = $1", [token])).toBeTruthy();
  });

  it("lets exactly one of five simultaneous submissions of one challenge through", async () => {
    const account = newAccount();
    const { token, payload } = await issued(account);
    const signature = sign(account, payload);
    const results = await Promise.all([
      completeSellerRegistration(token, signature),
      completeSellerRegistration(token, signature),
      completeSellerRegistration(token, signature),
      completeSellerRegistration(token, signature),
      completeSellerRegistration(token, signature),
    ]);
    const accepted = results.filter((result) => result.ok);
    expect(accepted.length, `the conditional UPDATE let ${accepted.length} of 5 through`).toBe(1);
    const refusals = results.filter((result) => !result.ok).map((result: any) => result.reason);
    // Not merely "one won": the other four lost the row lock and each of them reports the lock, rather
    // than a stale read or a unique-violation crash. That distinction is Postgres', not code I wrote.
    expect(refusals).toEqual(["challenge_replayed", "challenge_replayed", "challenge_replayed", "challenge_replayed"]);
    const count = await row("select count(*)::int as n from sellers where address = $1", [account.registration.address]);
    expect(count.n).toBe(1);
  });

  it("hands one challenge to exactly one of three concurrent claims", async () => {
    // The test above goes through the whole flow, so its five requests each read the row first, and
    // Postgres may serialise them enough that every loser sees `consumed_at` in that read and never
    // reaches the claim. This asks for the same token three times at the statement that decides it, so
    // what is measured is the condition, not the timing: the second and third re-evaluate the WHERE
    // clause against the locked row after the first commits, and cannot match it.
    const account = newAccount();
    const { token } = await issued(account);
    const claims = await Promise.all([claimRegistrationChallenge(token), claimRegistrationChallenge(token), claimRegistrationChallenge(token)]);
    expect(claims.filter(Boolean).length, `the conditional UPDATE answered ${claims.filter(Boolean).length} of 3 claims`).toBe(1);
    const spent = await row("select (consumed_at is not null) as consumed from registration_challenges where token = $1", [token]);
    expect(spent.consumed).toBe(true);
  });

  it("refuses a replay after the seller was registered, and does not overwrite the row", async () => {
    const account = newAccount();
    const { token, payload } = await issued(account);
    await expect(completeSellerRegistration(token, sign(account, payload))).resolves.toMatchObject({ ok: true });

    const replay = await completeSellerRegistration(token, sign(account, payload));
    expect(replay).toMatchObject({ ok: false, reason: "challenge_replayed" });

    // A second challenge for the same account: refused at issue, and again at confirmation, and the
    // name the first one registered survives both attempts.
    const second = await issueRegistrationChallenge({ ...account.registration, name: "Renamed by a second attempt" });
    expect(second).toMatchObject({ ok: false, reason: "seller_exists" });
    const name = await row("select name from sellers where address = $1", [account.registration.address]);
    expect(name.name).toBe(account.registration.name);
  });

  it("refuses a signature over text the database did not record, even when it is a valid signature", async () => {
    const account = newAccount();
    const { token } = await issued(account);
    const tampered = buildRegistrationPayload({ ...account.registration, name: "Someone else's API" }, token);
    // Real key, real SEP-53 signature, wrong text: the recorded payload is the authority.
    const done = await completeSellerRegistration(token, sign(account, tampered));
    expect(done).toMatchObject({ ok: false, reason: "signature_invalid" });
    expect((await row("select count(*)::int as n from sellers where address = $1", [account.registration.address])).n).toBe(0);
  });

  it("refuses a challenge past its expiry on the database clock, not the process clock", async () => {
    const account = newAccount();
    const { token, payload } = await issued(account);
    await db().query("update registration_challenges set expires_at = now() - interval '1 minute' where token = $1", [token]);
    const done = await completeSellerRegistration(token, sign(account, payload));
    expect(done).toMatchObject({ ok: false, reason: "challenge_expired" });

    // The claim itself refuses it too, not only the read before it: the two conditions are independent
    // guards, and a test that only reaches the first would let the second be deleted.
    expect(await claimRegistrationChallenge(token), "an expired challenge must not be claimable").toBe(false);

    // And the expired challenge is not spent by the refusal, so the row still reads as an attempt.
    const spent = await row("select (consumed_at is not null) as consumed from registration_challenges where token = $1", [token]);
    expect(spent.consumed).toBe(false);
  });

  it("finds the challenge whatever case the token arrives in", async () => {
    const account = newAccount();
    const { token, payload } = await issued(account);
    // `token` is `char(64)`, so this is Postgres' own comparison being measured, not the fake's map.
    await expect(completeSellerRegistration(token.toUpperCase(), sign(account, payload))).resolves.toMatchObject({ ok: true });
  });

  it("normalises the name and delivery key the same way in the row and in the seller", async () => {
    const account = newAccount();
    const padded = { ...account.registration, name: `  ${account.registration.name}  `, deliveryKey: account.registration.deliveryKey.toUpperCase() };
    const result = await issueRegistrationChallenge(padded);
    if (!result.ok) throw new Error(`issue refused: ${result.message}`);
    tokens.push(result.value.token);
    // The payload carries the trimmed name and the lowered key, so the signature is over stored values.
    expect(result.value.payload).toContain(`name: ${account.registration.name}\n`);
    expect(result.value.payload).toContain(`delivery key: ${account.registration.deliveryKey}\n`);
    const stored = await row("select name, delivery_key from registration_challenges where token = $1", [result.value.token]);
    expect(stored.name).toBe(account.registration.name);
    expect(stored.delivery_key.trim()).toBe(account.registration.deliveryKey);
  });
});

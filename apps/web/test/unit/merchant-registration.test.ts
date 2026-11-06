import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";

/**
 * Registration is proven by a signature, so the tests are too: every case here signs with a real
 * ed25519 key through `@stellar/stellar-sdk` and Studio decides with the same call. A mock of the
 * verifier could only ever agree with whatever it was told.
 *
 * The database is a fake that enforces the two things the flow depends on and ignores the rest of
 * Postgres: `sellers.address` is a primary key, and the challenge is spent by a conditional UPDATE
 * that only answers a row while it is unconsumed and unexpired.
 */
import {
  buildRegistrationPayload,
  CHALLENGE_TTL_MINUTES,
  checkRegistrationFields,
  completeSellerRegistration,
  issueRegistrationChallenge,
  parseSignature,
  verifyRegistrationSignature,
  type SellerRegistration,
} from "@/app/(merchant)/merchant/register/registration";
import { db } from "@/lib/db";

vi.mock("@/lib/db", () => ({ db: vi.fn() }));

interface ChallengeRow {
  token: string;
  address: string;
  name: string;
  delivery_key: string;
  refund_vault: string | null;
  payload: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

class FakeDatabase {
  challenges = new Map<string, ChallengeRow>();
  sellers = new Map<string, { name: string; delivery_key: string; refund_vault: string | null }>();
  /** One clock for the whole fake, so an expiry test moves time instead of arguing about `now()`. */
  now = new Date("2026-11-06T12:00:00.000Z");
  queries: string[] = [];

  async query(sql: string, params: unknown[] = []): Promise<{ rowCount: number; rows: unknown[] }> {
    this.queries.push(sql.replace(/\s+/g, " ").trim());
    const text = sql.replace(/\s+/g, " ").trim();
    if (text.startsWith("select 1 from sellers where address =")) {
      const hit = this.sellers.has(String(params[0]));
      return { rowCount: hit ? 1 : 0, rows: hit ? [{ "?column?": 1 }] : [] };
    }
    if (text.startsWith("insert into registration_challenges")) {
      const [token, address, name, delivery_key, refund_vault, payload, minutes] = params as string[];
      if (this.challenges.has(token)) throw Object.assign(new Error("duplicate key value"), { code: "23505" });
      this.challenges.set(token, {
        token,
        address,
        name,
        delivery_key,
        refund_vault,
        payload,
        expiresAt: new Date(this.now.getTime() + Number(minutes) * 60_000),
        consumedAt: null,
      });
      return { rowCount: 1, rows: [] };
    }
    if (text.startsWith("select address, name, delivery_key, refund_vault, payload")) {
      const row = this.challenges.get(String(params[0]));
      if (!row) return { rowCount: 0, rows: [] };
      return {
        rowCount: 1,
        rows: [
          {
            address: row.address,
            name: row.name,
            delivery_key: row.delivery_key,
            refund_vault: row.refund_vault,
            payload: row.payload,
            consumed: row.consumedAt !== null,
            expired: row.expiresAt <= this.now,
          },
        ],
      };
    }
    if (text.startsWith("update registration_challenges")) {
      const row = this.challenges.get(String(params[0]));
      const claimable = row && row.consumedAt === null && row.expiresAt > this.now;
      if (!claimable) return { rowCount: 0, rows: [] };
      row!.consumedAt = this.now;
      return { rowCount: 1, rows: [{ token: row!.token }] };
    }
    if (text.startsWith("insert into sellers")) {
      const [address, name, delivery_key, refund_vault] = params as string[];
      if (this.sellers.has(address)) throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
      this.sellers.set(address, { name, delivery_key, refund_vault });
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`FakeDatabase was not told about: ${text.slice(0, 90)}`);
  }
}

let pg: FakeDatabase;

beforeEach(() => {
  pg = new FakeDatabase();
  vi.mocked(db).mockReturnValue(pg as unknown as ReturnType<typeof db>);
});

const seller = (overrides: Partial<SellerRegistration> = {}): SellerRegistration => ({
  address: Keypair.random().publicKey(),
  name: "Northstar Research API",
  deliveryKey: Keypair.random().rawPublicKey().toString("hex"),
  refundVault: "CAN4XKE3YUTQDPF6A3VCUWGITJSE53FWQRRSRXMS5PCG4LFVUMNIXMYX",
  ...overrides,
});

/** The secret key behind an address is not carried by `seller()`, so the pair that made it is remembered. */
const keypairs = new Map<string, Keypair>();
function keypairFor(address: string): Keypair {
  // `seller()` generates a fresh account each call; the fixture registers the pair it made.
  for (const kp of keypairs.values()) if (kp.publicKey() === address) return kp;
  throw new Error(`no keypair kept for ${address}`);
}
function payloadSignature(address: string, payload: string): string {
  return keypairFor(address).signMessage(Buffer.from(payload, "utf8")).toString("hex");
}
function newSeller(): { registration: SellerRegistration; keypair: Keypair } {
  const keypair = Keypair.random();
  keypairs.set(keypair.publicKey(), keypair);
  return { registration: seller({ address: keypair.publicKey() }), keypair };
}

async function issued(registration: SellerRegistration) {
  const result = await issueRegistrationChallenge(registration);
  if (!result.ok) throw new Error(`challenge issue refused: ${result.message}`);
  return result.value;
}

describe("issuing a challenge", () => {
  it("records a 64-hex token and the text it will be asked to sign", async () => {
    const { registration } = newSeller();
    const { token, payload } = await issued(registration);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(pg.challenges.size).toBe(1);
    const row = [...pg.challenges.values()][0];
    expect(row.token).toBe(token);
    expect(row.address).toBe(registration.address);
    expect(row.expiresAt.getTime()).toBe(pg.now.getTime() + CHALLENGE_TTL_MINUTES * 60_000);
    expect(payload).toContain(`account: ${registration.address}`);
    expect(payload).toContain(`challenge: ${token}`);
  });

  it("keeps the delivery key lowercase and turns an empty vault into no vault", async () => {
    const { registration } = newSeller();
    await issued(seller({ ...registration, deliveryKey: registration.deliveryKey.toUpperCase(), refundVault: "" as unknown as null }));
    const row = [...pg.challenges.values()][0];
    expect(row.delivery_key).toBe(registration.deliveryKey.toLowerCase());
    expect(row.refund_vault).toBeNull();
  });

  it("refuses an address that is not a Stellar account, and writes nothing", async () => {
    const before = pg.queries.length;
    const result = await issueRegistrationChallenge(seller({ address: "GBBD47IF" }));
    expect(result).toMatchObject({ ok: false, reason: "address_invalid" });
    expect(pg.challenges.size).toBe(0);
    // Refused before the database is asked anything, so a typo cannot spend a slot.
    expect(pg.queries.length).toBe(before);
  });

  it.each([
    ["name_missing", { name: "   " }],
    ["name_too_long", { name: "n".repeat(201) }],
    ["delivery_key_invalid", { deliveryKey: "nothex" }],
    ["delivery_key_invalid", { deliveryKey: "4".repeat(63) }],
    ["refund_vault_invalid", { refundVault: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" }],
  ])("refuses %s before any challenge exists", async (reason, overrides) => {
    const { registration } = newSeller();
    const result = await issueRegistrationChallenge(seller({ ...registration, ...overrides }));
    expect(result).toMatchObject({ ok: false, reason });
    expect(pg.challenges.size).toBe(0);
  });

  it("refuses an account that is already a seller instead of inviting a signature that cannot land", async () => {
    const { registration } = newSeller();
    pg.sellers.set(registration.address, { name: "Already", delivery_key: registration.deliveryKey, refund_vault: null });
    const result = await issueRegistrationChallenge(registration);
    expect(result).toMatchObject({ ok: false, reason: "seller_exists" });
    expect(pg.challenges.size).toBe(0);
  });

  it("names the field it refused in the sentence it shows", async () => {
    const { registration } = newSeller();
    const result = await issueRegistrationChallenge(seller({ ...registration, deliveryKey: "zz" }));
    expect(!result.ok && result.message).toMatch(/delivery key must be 64 hex characters/i);
  });
});

describe("completing a registration", () => {
  it("accepts a signature made by the account the challenge was issued to", async () => {
    const { registration } = newSeller();
    const { token, payload } = await issued(registration);
    const result = await completeSellerRegistration(token, payloadSignature(registration.address, payload));
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.value).toEqual({
      address: registration.address,
      name: registration.name,
      deliveryKey: registration.deliveryKey.toLowerCase(),
      refundVault: registration.refundVault,
    });
    expect(pg.sellers.get(registration.address)).toEqual({
      name: registration.name,
      delivery_key: registration.deliveryKey.toLowerCase(),
      refund_vault: registration.refundVault,
    });
    expect(payload).toContain("name: " + registration.name);
  });

  it("takes base64 as readily as hex, because that is what a wallet returns", async () => {
    const { registration, keypair } = newSeller();
    const { token, payload } = await issued(registration);
    const base64 = keypair.signMessage(Buffer.from(payload, "utf8")).toString("base64");
    await expect(completeSellerRegistration(token, base64)).resolves.toMatchObject({ ok: true });
  });

  it("refuses a signature from a different account, and leaves the challenge unspent", async () => {
    const { registration } = newSeller();
    const other = Keypair.random();
    const { token, payload } = await issued(registration);
    const result = await completeSellerRegistration(token, other.signMessage(Buffer.from(payload, "utf8")).toString("hex"));
    expect(result).toMatchObject({ ok: false, reason: "signature_invalid" });
    expect(pg.sellers.size).toBe(0);
    expect([...pg.challenges.values()][0].consumedAt).toBeNull();
  });

  it("refuses a signature made for someone else's challenge", async () => {
    const a = newSeller();
    const b = newSeller();
    const issuedA = await issued(a.registration);
    const issuedB = await issued(b.registration);
    // A real signature, on a real payload — just not the one this token belongs to.
    const result = await completeSellerRegistration(issuedB.token, payloadSignature(a.registration.address, issuedA.payload));
    expect(result).toMatchObject({ ok: false, reason: "signature_invalid" });
    expect(pg.sellers.size).toBe(0);
    expect(pg.challenges.get(issuedB.token)!.consumedAt).toBeNull();
  });

  it("refuses a replayed challenge, registering the seller once", async () => {
    const { registration } = newSeller();
    const { token, payload } = await issued(registration);
    const signature = payloadSignature(registration.address, payload);
    await expect(completeSellerRegistration(token, signature)).resolves.toMatchObject({ ok: true });
    const replay = await completeSellerRegistration(token, signature);
    expect(replay).toMatchObject({ ok: false, reason: "challenge_replayed" });
    expect(pg.sellers.size).toBe(1);
  });

  it("lets only one of two simultaneous submissions through", async () => {
    const { registration } = newSeller();
    const { token, payload } = await issued(registration);
    const signature = payloadSignature(registration.address, payload);
    const results = await Promise.all([completeSellerRegistration(token, signature), completeSellerRegistration(token, signature)]);
    expect(results.filter((r) => r.ok).length).toBe(1);
    expect(results.filter((r) => !r.ok).map((r) => (r as { reason: string }).reason)).toEqual(["challenge_replayed"]);
    expect(pg.sellers.size).toBe(1);
  });

  it("refuses an expired challenge and says it is expired rather than unsigned", async () => {
    const { registration } = newSeller();
    const { token, payload } = await issued(registration);
    pg.now = new Date(pg.now.getTime() + (CHALLENGE_TTL_MINUTES + 1) * 60_000);
    const result = await completeSellerRegistration(token, payloadSignature(registration.address, payload));
    expect(result).toMatchObject({ ok: false, reason: "challenge_expired" });
    expect(pg.sellers.size).toBe(0);
  });

  it("finds the challenge whatever case the token arrives in", async () => {
    // A signature is worthless if the caps lock losing the challenge it belongs to. The column is text,
    // so Postgres would compare it case-sensitively and refuse a token that only differs in its hex case.
    const { registration } = newSeller();
    const { token, payload } = await issued(registration);
    await expect(completeSellerRegistration(token.toUpperCase(), payloadSignature(registration.address, payload))).resolves.toMatchObject({
      ok: true,
    });
    expect(pg.sellers.size).toBe(1);
  });

  it("refuses a token Studio never issued, without looking it up", async () => {
    const result = await completeSellerRegistration("not-a-token", "ab".repeat(64));
    expect(result).toMatchObject({ ok: false, reason: "challenge_unknown" });
    expect(pg.queries).toEqual([]);
  });

  it("refuses a signature that is neither hex nor base64, nor 64 bytes", async () => {
    const { registration } = newSeller();
    const { token } = await issued(registration);
    await expect(completeSellerRegistration(token, "just words")).resolves.toMatchObject({ ok: false, reason: "signature_unreadable" });
    await expect(completeSellerRegistration(token, "ab".repeat(63))).resolves.toMatchObject({ ok: false, reason: "signature_wrong_length" });
    await expect(completeSellerRegistration(token, "")).resolves.toMatchObject({ ok: false, reason: "signature_missing" });
    expect(pg.sellers.size).toBe(0);
  });

  it("inserts what the challenge recorded, not what the request claims", async () => {
    const { registration } = newSeller();
    const { token, payload } = await issued(registration);
    const stored = [...pg.challenges.values()][0];
    // The form posts only a token and a signature; a second, altered set of fields is not read at all.
    stored.name = "Hijacked Name";
    const result = await completeSellerRegistration(token, payloadSignature(registration.address, payload));
    expect(result.ok && result.value.name).toBe("Hijacked Name");
    expect(pg.sellers.get(registration.address)?.name).toBe("Hijacked Name");
  });

  it("reports a duplicate that raced the insert rather than overwriting it", async () => {
    const { registration } = newSeller();
    const { token, payload } = await issued(registration);
    // Skip the pre-check by putting the seller in after the challenge was issued.
    pg.sellers.set(registration.address, { name: "Raced Ahead", delivery_key: "4".repeat(64), refund_vault: null });
    // The unspent challenge is still live, so the read above catches it; force the race past it.
    const signature = payloadSignature(registration.address, payload);
    const result = await completeSellerRegistration(token, signature);
    expect(result).toMatchObject({ ok: false, reason: "seller_exists" });
    expect(pg.sellers.get(registration.address)?.name).toBe("Raced Ahead");
  });

  it("reports a duplicate that only the primary key catches", async () => {
    const { registration } = newSeller();
    const { token, payload } = await issued(registration);
    const signature = payloadSignature(registration.address, payload);
    const original = pg.query.bind(pg);
    let armed = false;
    pg.query = async (sql: string, params?: unknown[]) => {
      const text = sql.replace(/\s+/g, " ").trim();
      if (armed && text.startsWith("insert into sellers")) throw Object.assign(new Error("duplicate key value"), { code: "23505" });
      if (text.startsWith("select 1 from sellers")) armed = true; // the pre-check says the address is free
      return original(sql, params);
    };
    const result = await completeSellerRegistration(token, signature);
    expect(result).toMatchObject({ ok: false, reason: "seller_exists" });
    expect([...pg.challenges.values()][0].consumedAt).not.toBeNull();
  });

  it("keeps a database failure a failure instead of a refusal the page can smile through", async () => {
    const { registration } = newSeller();
    const { token, payload } = await issued(registration);
    const original = pg.query.bind(pg);
    pg.query = async (sql: string, params?: unknown[]) => {
      if (sql.replace(/\s+/g, " ").trim().startsWith("insert into sellers")) throw new Error("connection terminated");
      return original(sql, params);
    };
    await expect(completeSellerRegistration(token, payloadSignature(registration.address, payload))).rejects.toThrow("connection terminated");
  });
});

describe("the text under signature", () => {
  it("binds every field that becomes a seller row", () => {
    const registration = seller({ refundVault: null });
    const payload = buildRegistrationPayload({ ...registration, deliveryKey: registration.deliveryKey.toLowerCase() }, "t".repeat(64));
    expect(payload.split("\n").map((line) => line.split(":")[0])).toEqual([
      "Pactwright seller registration",
      "account",
      "name",
      "delivery key",
      "refund vault",
      "challenge",
    ]);
    expect(payload).toContain("refund vault: none");
    expect(checkRegistrationFields(registration)).toBeNull();
  });

  it("verifies through SEP-53, so a signature here is not a signature on a transaction", () => {
    const { registration, keypair } = newSeller();
    const payload = buildRegistrationPayload(registration, "t".repeat(64));
    const signature = keypair.signMessage(Buffer.from(payload, "utf8"));
    expect(verifyRegistrationSignature(registration.address, payload, signature)).toBe(true);
    // The raw sha256 path — what a transaction signs — does not satisfy the message path.
    const raw = keypair.sign(Buffer.from(payload, "utf8"));
    expect(verifyRegistrationSignature(registration.address, payload, raw)).toBe(false);
    expect(verifyRegistrationSignature("GBBD47IF", payload, signature)).toBe(false);
  });

  it("reads a signature in either encoding and nothing else", () => {
    const { keypair } = newSeller();
    const signature = keypair.signMessage(Buffer.from("x", "utf8"));
    expect(parseSignature(signature.toString("hex"))).toHaveProperty("signature");
    expect(parseSignature(signature.toString("base64"))).toHaveProperty("signature");
    expect(parseSignature("  ")).toMatchObject({ reason: "signature_missing" });
    expect(parseSignature("hello world")).toMatchObject({ reason: "signature_unreadable" });
    expect(parseSignature("ab")).toMatchObject({ reason: "signature_wrong_length" });
  });
});

describe("the server-only code stays off the client", () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const REGISTER_DIR = join(HERE, "../../app/(merchant)/merchant/register");

  it("is not imported by any component the browser loads", () => {
    const offenders: string[] = [];
    for (const dir of [join(HERE, "../../app"), join(HERE, "../../components")]) {
      for (const file of walk(dir)) {
        if (!file.endsWith(".tsx") && !file.endsWith(".ts")) continue;
        const src = readFileSync(file, "utf8");
        if (!src.includes('"use client"')) continue;
        const loaded = importedSpecifiers(src).filter(
          (s) => s.endsWith("/registration") || s === "./registration" || s.startsWith("node:crypto")
        );
        if (loaded.length) offenders.push(`${relative(join(HERE, "../.."), file)} imports ${loaded.join(", ")}`);
      }
    }
    expect(offenders, `registration reaches Postgres and node:crypto; a client import would ship it: ${offenders.join("; ")}`).toEqual([]);
  });

  it("keeps the actions module marked as server code", () => {
    expect(readFileSync(join(REGISTER_DIR, "actions.ts"), "utf8").startsWith('"use server"')).toBe(true);
    expect(readFileSync(join(REGISTER_DIR, "register-form.tsx"), "utf8").startsWith('"use client"')).toBe(true);
  });

  it("exports only async functions from the server module, which is what Next allows there", async () => {
    // `A "use server" file can only export async functions, found object` is a request-time error: the
    // build passes, the page renders, and only the POST fails. So the rule is asserted against the
    // compiled module's actual exports — which is what Next reads — not against the source text.
    const actions = await import("@/app/(merchant)/merchant/register/actions");
    const exported = Object.keys(actions);
    expect(exported.length, "the actions module exports nothing, so the form has no server action to post to").toBeGreaterThan(0);
    const notFunctions = exported.filter((name) => typeof (actions as Record<string, unknown>)[name] !== "function");
    expect(notFunctions, `actions.ts exports ${notFunctions.join(", ")}; only async functions may cross the boundary`).toEqual([]);
  });

  it("spends the challenge with one conditional UPDATE, not a read and a write", async () => {
    const { registration } = newSeller();
    const { token, payload } = await issued(registration);
    await expect(completeSellerRegistration(token, payloadSignature(registration.address, payload))).resolves.toMatchObject({ ok: true });
    const updates = pg.queries.filter((sql) => sql.startsWith("update registration_challenges"));
    expect(updates.length, "spending a challenge must be one write, not a read then a write").toBe(1);
    expect(updates[0]).toContain("consumed_at is null");
    expect(updates[0]).toContain("expires_at > now()");
  });
});

/**
 * The modules a file actually asks the bundler for — not every string that appears in it. Prose in a
 * comment can name `node:crypto` (and `CertificateCard.tsx` does, to explain why it lazy-loads), and
 * that is not an import; only the specifiers are.
 */
function importedSpecifiers(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:/])\/\/[^\n]*/g, "$1");
  return [...code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)].map((match) => match[1]);
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

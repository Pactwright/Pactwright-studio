/**
 * Seller registration, proven by a signature. ROADMAP P7-21, studio#88.
 *
 * Server-side only: it reaches Postgres and verifies ed25519 signatures, so no client component may
 * import it. The page in this folder is the only caller.
 *
 * The flow is two steps because the second one needs something only the seller's secret key can
 * produce: Studio records what it asked to be signed, and the confirmation re-reads that record
 * instead of trusting the browser, so a request cannot restate the name or the refund vault after
 * the signature was made.
 */
import { randomBytes } from "node:crypto";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { db } from "@/lib/db";

/** How long a challenge stays signable. Long enough to open a wallet, short enough to not be a credential. */
export const CHALLENGE_TTL_MINUTES = 15;

export interface SellerRegistration {
  address: string;
  name: string;
  deliveryKey: string;
  refundVault: string | null;
}

/** A refusal that can be printed as it stands, plus the code a test or a log can match on. */
export interface RegistrationRefusal {
  ok: false;
  reason: string;
  message: string;
  /**
   * The text Studio has on record for this challenge, present once the row has been read. Step 2 shows
   * it after a refusal instead of echoing what the request carried, so the seller is shown the words
   * they actually have to sign.
   */
  payload?: string;
}

export type RegistrationResult<T> = { ok: true; value: T } | RegistrationRefusal;

const HEX64 = /^[0-9a-f]{64}$/i;
const MAX_NAME_LENGTH = 200;

function refuse(reason: string, message: string): RegistrationRefusal {
  return { ok: false, reason, message };
}

/** A refusal about a challenge whose row was read, so the recorded text can travel with it. */
function refuseWithPayload(row: { payload: string }, reason: string, message: string): RegistrationRefusal {
  return { ...refuse(reason, message), payload: row.payload };
}

/** The exact text the seller signs. Bound to the account, the record and the one-time token. */
export function buildRegistrationPayload(registration: SellerRegistration, token: string): string {
  return [
    "Pactwright seller registration",
    `account: ${registration.address}`,
    `name: ${registration.name}`,
    `delivery key: ${registration.deliveryKey}`,
    `refund vault: ${registration.refundVault ?? "none"}`,
    `challenge: ${token}`,
  ].join("\n");
}

/** A wallet signs a challenge and hands back hex or base64; both are accepted, nothing else is. */
export function parseSignature(input: string): { signature: Buffer } | RegistrationRefusal {
  const text = input.trim();
  if (!text) return refuse("signature_missing", "No signature was given, so this account has not proven it holds the key.");
  let bytes: Buffer;
  if (/^[0-9a-f]{128}$/i.test(text)) bytes = Buffer.from(text, "hex");
  else if (/^[A-Za-z0-9+/=]+$/.test(text)) bytes = Buffer.from(text, "base64");
  else return refuse("signature_unreadable", "The signature is neither 128 hex characters nor base64, so it cannot be checked.");
  if (bytes.length !== 64)
    return refuse(
      "signature_wrong_length",
      `An ed25519 signature is 64 bytes; this one decodes to ${bytes.length}, so it cannot be checked.`
    );
  return { signature: bytes };
}

/**
 * Does `signature` prove control of `address` over exactly this text? `verifyMessage` is SEP-53: the
 * SDK hashes `"Stellar Signed Message:\n" + text` before checking, so a signature made here can never
 * be replayed as a transaction signature, and the other way round.
 */
export function verifyRegistrationSignature(address: string, payload: string, signature: Buffer): boolean {
  try {
    return Keypair.fromPublicKey(address).verifyMessage(payload, signature);
  } catch {
    return false;
  }
}

/** What the form is allowed to say a seller is, before anything is written down. */
export function checkRegistrationFields(input: SellerRegistration): RegistrationRefusal | null {
  if (!StrKey.isValidEd25519PublicKey(input.address))
    return refuse(
      "address_invalid",
      `${input.address || "The account"} is not a Stellar account address (a G… string), so Studio has no key to check a signature against.`
    );
  if (!input.name.trim()) return refuse("name_missing", "A seller needs a name — it is what the dashboard and the 402 response will show.");
  if (input.name.trim().length > MAX_NAME_LENGTH)
    return refuse("name_too_long", `The name is ${input.name.trim().length} characters; a seller name is at most ${MAX_NAME_LENGTH}.`);
  if (!HEX64.test(input.deliveryKey))
    return refuse(
      "delivery_key_invalid",
      `The delivery key must be 64 hex characters (an ed25519 public key); "${input.deliveryKey.slice(0, 16)}…" is not.`
    );
  if (input.refundVault !== null && !StrKey.isValidContract(input.refundVault))
    return refuse(
      "refund_vault_invalid",
      `${input.refundVault} is not a contract address (a C… string), and a refund vault is a contract — an account could hold the funds back itself.`
    );
  return null;
}

/**
 * Spend the challenge, atomically, and say whether this call is the one that spent it.
 *
 * Postgres locks the row, so a request that arrives after another has committed re-evaluates
 * `consumed_at is null` against the updated row and gets nothing back. Two copies of the same signature
 * cannot both register without a race in a read-then-write or a transaction around two statements.
 */
export async function claimRegistrationChallenge(token: string): Promise<boolean> {
  const claimed = await db().query(
    `update registration_challenges
        set consumed_at = now()
      where token = $1
        and consumed_at is null
        and expires_at > now()
       returning token`,
    [token.trim().toLowerCase()],
  );
  return claimed.rowCount === 1;
}

/** Step one: record what will be asked to sign, and hand the seller the text. */
export async function issueRegistrationChallenge(input: SellerRegistration): Promise<RegistrationResult<{ token: string; payload: string }>> {
  const registration: SellerRegistration = {
    address: input.address.trim(),
    name: input.name.trim(),
    deliveryKey: input.deliveryKey.trim().toLowerCase(),
    refundVault: input.refundVault ? input.refundVault.trim() : null,
  };

  const invalid = checkRegistrationFields(registration);
  if (invalid) return invalid;

  const pool = db();
  const existing = await pool.query("select 1 from sellers where address = $1", [registration.address]);
  if (existing.rowCount! > 0)
    return refuse(
      "seller_exists",
      `${registration.address} is already registered as "${registration.name}" — one seller row per account, so nothing here will overwrite it.`
    );

  const token = randomBytes(32).toString("hex");
  const payload = buildRegistrationPayload(registration, token);
  await pool.query(
    `insert into registration_challenges (token, address, name, delivery_key, refund_vault, payload, expires_at)
     values ($1, $2, $3, $4, $5, $6, now() + make_interval(mins => $7))`,
    [token, registration.address, registration.name, registration.deliveryKey, registration.refundVault, payload, CHALLENGE_TTL_MINUTES]
  );
  return { ok: true, value: { token, payload } };
}

/**
 * Step two: the signature, checked against what Studio recorded — not against what this request
 * claims. Returns the seller that was inserted so the page can say who it registered.
 */
export async function completeSellerRegistration(token: string, signatureInput: string): Promise<RegistrationResult<SellerRegistration>> {
  if (!HEX64.test(token.trim()))
    return refuse("challenge_unknown", "That is not a challenge Studio issued, so there is nothing to check a signature against.");

  const pool = db();
  const found = await pool.query<{
    address: string;
    name: string;
    delivery_key: string;
    refund_vault: string | null;
    payload: string;
    consumed: boolean;
    expired: boolean;
  }>(
    `select address, name, delivery_key, refund_vault, payload,
            (consumed_at is not null) as consumed,
            (expires_at <= now()) as expired
       from registration_challenges
      where token = $1`,
    [token.trim().toLowerCase()]
  );
  if (found.rowCount === 0) return refuse("challenge_unknown", "Studio has no record of that challenge, so it cannot accept a signature for it.");

  const row = found.rows[0];
  if (row.consumed)
    return refuseWithPayload(
      row,
      "challenge_replayed",
      "That challenge was already used. A signature proves one registration; it is not a standing permission to register again.",
    );
  if (row.expired)
    return refuseWithPayload(
      row,
      "challenge_expired",
      `That challenge is older than ${CHALLENGE_TTL_MINUTES} minutes. Ask for a new one and sign it now.`,
    );

  const parsed = parseSignature(signatureInput);
  if ("message" in parsed) return { ...parsed, payload: row.payload };
  if (!verifyRegistrationSignature(row.address, row.payload, parsed.signature))
    return refuseWithPayload(
      row,
      "signature_invalid",
      `That signature does not prove control of ${row.address} for this challenge. Sign the text exactly as Studio showed it, with the account's secret key.`,
    );

  const existing = await pool.query("select 1 from sellers where address = $1", [row.address]);
  if (existing.rowCount! > 0)
    return refuseWithPayload(
      row,
      "seller_exists",
      `${row.address} is already registered in Studio, so this challenge will not create a second seller row.`,
    );

  // Single use, enforced by the database rather than by the read above: only the request that flips
  // `consumed_at` from null gets to register.
  if (!(await claimRegistrationChallenge(token)))
    return refuseWithPayload(row, "challenge_replayed", "That challenge was claimed by another request a moment ago. Ask for a new one.");

  try {
    await pool.query("insert into sellers (address, name, delivery_key, refund_vault) values ($1, $2, $3, $4)", [
      row.address,
      row.name,
      row.delivery_key,
      row.refund_vault,
    ]);
  } catch (error) {
    if ((error as { code?: string }).code === "23505")
      return refuseWithPayload(
        row,
        "seller_exists",
        `${row.address} was registered by another request; this challenge is spent and nothing was overwritten.`,
      );
    throw error;
  }
  return {
    ok: true,
    value: { address: row.address, name: row.name, deliveryKey: row.delivery_key, refundVault: row.refund_vault },
  };
}

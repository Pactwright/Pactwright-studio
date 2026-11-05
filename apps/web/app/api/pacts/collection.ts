/**
 * The query parameters `GET /api/pacts` accepts, kept out of `route.ts` so the checks can be run
 * without an HTTP request and so the route exports only its handler. #75.
 *
 * Rejections carry the reason because the caller is a program paging through a chain it cannot see any
 * other way: a bare 400 makes it guess, and a 200 with an empty list on a bad cursor makes it stop
 * paging when there is more.
 */
import { parsePactCursor, type PactCursor, type PactPageFilters } from "@/lib/pacts";
import type { PactState } from "@/lib/types";

/** Must match the `state` CHECK constraint in `migrations/001_core.sql`; a test asserts it does. */
export const PACT_STATES: readonly PactState[] = [
  "funded",
  "paid",
  "allowed",
  "denied",
  "settled",
  "released",
  "refunded",
];

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;

/** A Stellar account address, which is what `pacts.seller` holds. */
const SELLER_ADDRESS = /^G[A-Z2-7]{55}$/;

export type PactRequest = { ok: true; filters: PactPageFilters } | { ok: false; reason: string };

/** Empty means "no filter": `?state=&seller=&cursor=&limit=` is the documented shape for "everything". */
function value(params: URLSearchParams, name: string): string | undefined {
  const raw = params.get(name);
  return raw === null || raw === "" ? undefined : raw;
}

export function parsePactRequest(params: URLSearchParams): PactRequest {
  const state = value(params, "state");
  if (state !== undefined && !PACT_STATES.includes(state as PactState)) {
    return { ok: false, reason: `Invalid state (expected one of: ${PACT_STATES.join(", ")})` };
  }

  const seller = value(params, "seller");
  if (seller !== undefined && !SELLER_ADDRESS.test(seller)) {
    return { ok: false, reason: "Invalid seller (expected a Stellar account address)" };
  }

  const rawLimit = value(params, "limit");
  let limit = DEFAULT_LIMIT;
  if (rawLimit !== undefined) {
    if (!/^\d+$/.test(rawLimit)) {
      return { ok: false, reason: `Invalid limit (expected an integer from 1 to ${MAX_LIMIT})` };
    }
    const parsed = Number(rawLimit);
    if (parsed < 1 || parsed > MAX_LIMIT) {
      return { ok: false, reason: `Invalid limit (expected an integer from 1 to ${MAX_LIMIT})` };
    }
    limit = parsed;
  }

  const rawCursor = value(params, "cursor");
  let after: PactCursor | undefined;
  if (rawCursor !== undefined) {
    const decoded = parsePactCursor(rawCursor);
    if (!decoded) {
      return {
        ok: false,
        reason: "Invalid cursor (pass a nextCursor value from the previous page unchanged)",
      };
    }
    after = decoded;
  }

  return {
    ok: true,
    filters: {
      ...(state !== undefined ? { state: state as PactState } : {}),
      ...(seller !== undefined ? { seller } : {}),
      ...(after !== undefined ? { after } : {}),
      limit,
    },
  };
}

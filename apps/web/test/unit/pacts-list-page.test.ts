/**
 * #74: `/pacts` must be reachable by a visitor with no pact ID and no JavaScript, and its paging must not
 * repeat or drop a pact while the indexer is still appending.
 *
 * The page shares `parsePactRequest` with `GET /api/pacts` on purpose — two parsers would mean a filter the
 * API refuses and the page quietly ignores. What is pinned here is what a visitor can see: the keyset link
 * carries the filters forward, a bad parameter gets a sentence about what to change rather than an empty
 * table, an unreadable database says "unreachable" instead of "nothing yet", and the form is a GET form
 * because "works without JavaScript" is not a property you can assert about a button.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: vi.fn() }));

import { db } from "@/lib/db";
import PactsPage from "@/app/pacts/page";
import {
  emptyAdvice,
  filtersLabel,
  formatStamp,
  pageHref,
  readPactsView,
  shortId,
  toSearchParams,
} from "@/app/pacts/list";
import { pactCursorOf, type PactPageFilters } from "@/lib/pacts";
import type { PactRow } from "@/lib/types";

const query = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db).mockReturnValue({ query } as unknown as ReturnType<typeof db>);
});

const SELLER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

/** The filters a page reaches with no query parameters, plus whatever a test asks for. */
function filters(over: Partial<PactPageFilters> = {}): PactPageFilters {
  return { limit: 25, ...over };
}

function pact(index: number, state: PactRow["state"] = "settled"): PactRow {
  return {
    pact_id: index.toString(16).padStart(64, "0"),
    mode: "escrow",
    buyer: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVWGS",
    seller: SELLER,
    resource_url: "https://api.pactwright.dev/data/weather",
    cap: "10.0000000",
    condition_hash: "a".repeat(64),
    condition: { type: "http-match" },
    metered: false,
    silence: "refund",
    state,
    verdict_deadline: 50000000,
    settle_deadline: 50001000,
    to_seller: "10.0000000",
    to_buyer: "0.0000000",
    created_at: new Date(Date.UTC(2026, 10, 5, 12, 34, index)),
    updated_at: new Date(Date.UTC(2026, 10, 5, 13, 5, index)),
  } as PactRow;
}

/** `n` rows answered, so 26 rows means "there is a page after this one" at the default limit. */
function rows(count: number, state: PactRow["state"] = "settled"): { rows: PactRow[] } {
  return { rows: Array.from({ length: count }, (_, i) => pact(i, state)) };
}

function sql(): string {
  return String(query.mock.calls.at(-1)?.[0] ?? "");
}
function values(): unknown[] {
  return (query.mock.calls.at(-1)?.[1] ?? []) as unknown[];
}
function search(params: Record<string, string | string[] | undefined>) {
  return readPactsView(params);
}
async function page(params: Record<string, string | string[] | undefined> = {}) {
  const payload = await PactsPage({ searchParams: Promise.resolve(params) });
  return JSON.stringify(payload);
}

describe("#74 the page asks the database the right question", () => {
  it("reads 25 newest first by default, and one row more to learn whether a page follows", async () => {
    query.mockResolvedValue(rows(25));
    const view = await search({});

    expect(view.kind).toBe("page");
    expect(query).toHaveBeenCalledTimes(1);
    expect(values()[0]).toBe(26);
    expect(sql()).toContain("ORDER BY created_at DESC, pact_id DESC");
    expect(sql()).not.toContain("OFFSET");
    if (view.kind !== "page") throw new Error("expected a page");
    expect(view.filters.limit).toBe(25);
    expect(view.nextCursor).toBeNull();
  });

  it("passes the state and seller filters into the WHERE clause", async () => {
    query.mockResolvedValue(rows(1));
    await search({ state: "refunded", seller: SELLER });

    expect(sql()).toContain("WHERE state = $1 AND seller = $2");
    expect(values().slice(0, 2)).toEqual(["refunded", SELLER]);
  });

  it("keeps paging on the keyset, with the cursor decoded from the link", async () => {
    query.mockResolvedValue(rows(1));
    const cursor = pactCursorOf(pact(3));
    const view = await search({ cursor });

    expect(sql()).toContain("(created_at, pact_id) < ($1::timestamptz, $2::text)");
    expect(values()[0]).toBe(pact(3).created_at.toISOString());
    expect(values()[1]).toBe(pact(3).pact_id);
    expect(view.kind).toBe("page");
  });

  it("takes the first value when a parameter is repeated", async () => {
    query.mockResolvedValue(rows(1));
    const view = await search({ state: ["refunded", "settled"] });

    expect(values()[0]).toBe("refunded");
    if (view.kind !== "page") throw new Error("expected a page");
    expect(view.filters.state).toBe("refunded");
  });

  it("refuses a state the schema has not got, and never reaches the database", async () => {
    const view = await search({ state: "settled; drop table pacts" });

    expect(query).not.toHaveBeenCalled();
    expect(view).toEqual({ kind: "rejected", reason: expect.stringContaining("Invalid state") });
  });

  it("refuses a torn cursor instead of showing an empty page", async () => {
    const view = await search({ cursor: "not-a-cursor" });

    expect(query).not.toHaveBeenCalled();
    expect(view).toEqual({ kind: "rejected", reason: expect.stringContaining("Invalid cursor") });
  });

  it("says the ledger is unreachable when the database does not answer", async () => {
    query.mockRejectedValue(new Error("connection refused"));
    const view = await search({});

    expect(query).toHaveBeenCalledTimes(1);
    expect(view).toEqual({ kind: "unavailable" });
  });
});

describe("#74 the paging links", () => {
  it("carries the filters into the older-pacts link", () => {
    const href = pageHref(filters({ state: "refunded", seller: SELLER }), "abc123");

    const params = new URL(href, "http://studio.test").searchParams;
    expect(params.get("state")).toBe("refunded");
    expect(params.get("seller")).toBe(SELLER);
    expect(params.get("cursor")).toBe("abc123");
    expect(href.startsWith("/pacts?")).toBe(true);
  });

  it("drops the cursor for the newest page and the limit when it is the default", () => {
    expect(pageHref(filters(), null)).toBe("/pacts");
    expect(pageHref(filters({ state: "paid" }), null)).toBe("/pacts?state=paid");
    expect(pageHref(filters({ limit: 100 }), "z")).toBe("/pacts?limit=100&cursor=z");
  });

  it("encodes a cursor that contains url-meaningful characters", () => {
    const cursor = pactCursorOf(pact(0));
    const href = pageHref(filters(), cursor);

    expect(new URL(href, "http://studio.test").searchParams.get("cursor")).toBe(cursor);
  });
});

describe("#74 what the page tells a visitor", () => {
  it("names the filters in force, and says nothing is filtered when nothing is", () => {
    expect(filtersLabel(filters())).toBeNull();
    expect(filtersLabel({ limit: 25, state: "refunded" })).toBe("state = refunded");
    expect(filtersLabel({ limit: 25, state: "refunded", seller: SELLER })).toBe(
      `state = refunded and seller = ${SELLER}`
    );
  });

  it("tells an empty result what to do next, differently when filters caused it", () => {
    expect(emptyAdvice({ limit: 25 })).toContain("Nothing is indexed yet");
    expect(emptyAdvice({ limit: 25, state: "refunded" })).toContain("No pacts match state = refunded");
  });

  it("stamps last change in UTC, with no locale and no relative time", () => {
    expect(formatStamp(new Date(Date.UTC(2026, 10, 5, 13, 5, 7)))).toBe("2026-11-05 13:05 UTC");
  });

  it("shortens an ID at both ends so two rows can be told apart", () => {
    expect(shortId("a".repeat(24) + "1f".repeat(20))).toBe("aaaaaaaa…1f1f1f");
    // Rows whose first eight characters are identical are still distinct, because the tail survives.
    expect(shortId(pact(1).pact_id)).toBe("00000000…000001");
    expect(shortId(pact(1).pact_id)).not.toBe(shortId(pact(2).pact_id));
  });

  it("normalises next's search params, first value of a repeated name winning", () => {
    const params = toSearchParams({ state: ["paid", "settled"], seller: SELLER, limit: undefined });

    expect(params.get("state")).toBe("paid");
    expect(params.get("seller")).toBe(SELLER);
    expect(params.has("limit")).toBe(false);
  });
});

describe("#74 the rendered page", () => {
  it("renders rows, links each pact by ID, and links the seller to its explorer account", async () => {
    query.mockResolvedValue(rows(3, "funded"));
    const html = await page();

    expect(html).toContain("/pact/" + pact(0).pact_id);
    expect(html).toContain("stellar.expert/explorer/testnet/account/" + SELLER);
    expect(html).toContain("2026-11-05 13:05 UTC");
    // One state badge per row, carrying that row's state; the word it is stamped in is StateBadge's own test.
    expect(html.match(/"props":\{"state":"funded"\}/g)).toHaveLength(3);
  });

  it("offers an older-pacts link only when the extra row says there is more", async () => {
    query.mockResolvedValue(rows(26));
    const withMore = await page();
    expect(withMore).toContain("Older pacts");
    expect(withMore).toContain("cursor");

    query.mockResolvedValue(rows(25));
    const atTheEnd = await page();
    expect(atTheEnd).not.toContain("Older pacts");
    expect(atTheEnd).toContain("These are the oldest indexed pacts");
  });

  it("filters with a GET form, so it works with no JavaScript", async () => {
    query.mockResolvedValue(rows(1));
    const html = await page();

    expect(html).toContain('"action":"/pacts"');
    expect(html).toContain('"method":"get"');
    expect(html).toContain('"name":"state"');
    expect(html).toContain('"name":"seller"');
  });

  it("answers a rejected parameter with the reason and a way out, not a table", async () => {
    query.mockResolvedValue(rows(1));
    const html = await page({ state: "nonsense" });

    expect(html).toContain("Invalid state");
    expect(html).toContain("Start from the newest pacts");
    expect(html).not.toContain("/pact/" + pact(0).pact_id);
    expect(query).not.toHaveBeenCalled();
  });

  it("answers an unreadable database as unreachable, never as empty", async () => {
    query.mockRejectedValue(new Error("connection refused"));
    const html = await page();

    expect(html).toContain("can");
    expect(html).toContain("unreachable");
    expect(html).not.toContain("Nothing is indexed yet");
  });

  it("keeps the filters visible and offers to clear them", async () => {
    query.mockResolvedValue(rows(1));
    const html = await page({ seller: SELLER });

    expect(html).toContain("Filtered to");
    expect(html).toContain(`seller = ${SELLER}`);
    expect(html).toContain("Clear filters");
  });
});

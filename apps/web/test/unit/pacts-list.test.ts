/**
 * #75: `GET /api/pacts` must page forward without repeating or losing a pact, and must say which
 * parameter it rejected.
 *
 * The collection is what an agent reads to find out what is on chain, so two failures matter more than
 * the SQL: a cursor that quietly returns an empty page when it is malformed (the caller concludes there
 * is nothing left), and an offset-style page that shifts under rows the indexer is still appending.
 * These tests pin the keyset, the cap, the 400 reasons, and the fact that a database failure answers 500
 * instead of `{ items: [] }`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: vi.fn() }));

import { db } from "@/lib/db";
import { listPacts, pactCursorOf, parsePactCursor } from "@/lib/pacts";
import type { PactRow } from "@/lib/types";
import { DEFAULT_LIMIT, MAX_LIMIT, PACT_STATES } from "@/app/api/pacts/collection";
import { GET } from "@/app/api/pacts/route";

const query = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db).mockReturnValue({ query } as unknown as ReturnType<typeof db>);
});

function pact(index: number): PactRow {
  const id = index.toString(16).padStart(64, "0");
  return {
    pact_id: id,
    mode: "escrow",
    buyer: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVWGS",
    seller: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    resource_url: "https://api.pactwright.dev/data/weather",
    cap: "10.0000000",
    condition_hash: "a".repeat(64),
    condition: { type: "http-match" },
    metered: false,
    silence: "refund",
    state: "settled",
    verdict_deadline: 50000000,
    settle_deadline: 50001000,
    to_seller: "10.0000000",
    to_buyer: "0.0000000",
    created_at: new Date(Date.UTC(2026, 10, 5, 12, 0, 0, index)),
    updated_at: new Date(),
  } as PactRow;
}

/** The one argument the route reads: a full URL, so `new URL(request.url)` sees the query string. */
function get(search = ""): Promise<Response> {
  return GET(new Request(`http://studio.test/api/pacts${search}`));
}

function sql(): string {
  return String(query.mock.calls.at(-1)?.[0] ?? "");
}
function values(): unknown[] {
  return (query.mock.calls.at(-1)?.[1] ?? []) as unknown[];
}

describe("#75 the state list is the schema's", () => {
  it("accepts exactly the states the table permits", () => {
    // migrations/001_core.sql owns the truth: a route that accepted a state the CHECK rejects would 500
    // on a valid-looking request, and one that dropped a state would hide indexed pacts.
    const schema = readFileSync(
      fileURLToPath(new URL("../../../../migrations/001_core.sql", import.meta.url)),
      "utf8"
    );
    const allowed = schema.match(/state\s+text not null check \(state in \(([^)]*)\)\)/);
    expect(allowed, "the pacts.state CHECK constraint moved; update this test and the route").not.toBeNull();
    const fromSql = allowed![1].split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
    expect([...PACT_STATES].sort()).toEqual([...fromSql].sort());
  });
});

describe("#75 listPacts pages by keyset", () => {
  it("asks for one row more than the page, and hands back the cursor for the next one", async () => {
    const rows = Array.from({ length: DEFAULT_LIMIT + 1 }, (_, i) => pact(i));
    query.mockResolvedValue({ rows });

    const page = await listPacts({ limit: DEFAULT_LIMIT });

    expect(page.items).toHaveLength(DEFAULT_LIMIT);
    expect(sql()).toContain(`LIMIT $1`);
    expect(values()).toEqual([DEFAULT_LIMIT + 1]);
    // The cursor names the last row the caller *received*, not the extra one that proved more exist.
    expect(page.nextCursor).toBe(pactCursorOf(rows[DEFAULT_LIMIT - 1]));
  });

  it("ends the page set when the database returns no extra row", async () => {
    query.mockResolvedValue({ rows: [pact(0), pact(1)] });
    const page = await listPacts({ limit: DEFAULT_LIMIT });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it("sorts and resumes on the same key, so a new row cannot shift the page", async () => {
    const after = { createdAt: new Date(Date.UTC(2026, 10, 4)), pactId: pact(7).pact_id };
    query.mockResolvedValue({ rows: [] });

    await listPacts({ after, limit: 10 });

    expect(sql()).toContain("ORDER BY created_at DESC, pact_id DESC");
    expect(sql()).toContain("(created_at, pact_id) < ($1::timestamptz, $2::text)");
    expect(sql()).not.toMatch(/OFFSET/i);
    expect(values().slice(0, 2)).toEqual([after.createdAt.toISOString(), after.pactId]);
  });

  it("adds no clause for a filter it was not given", async () => {
    query.mockResolvedValue({ rows: [] });
    await listPacts({ limit: 5 });
    expect(sql()).not.toContain("WHERE");
    expect(values()).toEqual([6]);
  });

  it("binds state and seller as parameters, never into the string", async () => {
    query.mockResolvedValue({ rows: [] });
    await listPacts({ state: "settled", seller: pact(0).seller, limit: 5 });
    expect(sql()).toContain("WHERE state = $1 AND seller = $2");
    expect(sql()).not.toContain("settled");
    expect(values()).toEqual(["settled", pact(0).seller, 6]);
  });

  it("round-trips a cursor through the codec", () => {
    const row = pact(3);
    const cursor = parsePactCursor(pactCursorOf(row));
    expect(cursor).toEqual({ createdAt: row.created_at, pactId: row.pact_id });
    // Opaque but not encrypted: it is a sort key, and nothing sensitive is in it.
    expect(pactCursorOf(row)).not.toContain(row.created_at.toISOString());
  });

  it("refuses a cursor it did not issue", () => {
    for (const junk of ["", "not-a-cursor", "!!!!", "e30=", Buffer.from("{}").toString("base64url")]) {
      expect(parsePactCursor(junk), `accepted ${JSON.stringify(junk)}`).toBeNull();
    }
  });
});

describe("#75 the route answers the documented shape", () => {
  it("returns items and nextCursor", async () => {
    query.mockResolvedValue({ rows: [pact(0)] });
    const res = await get();
    expect(res.status).toBe(200);
    expect(Object.keys(await res.json()).sort()).toEqual(["items", "nextCursor"]);
  });

  it("defaults the limit to 25 and caps it at 100", async () => {
    query.mockResolvedValue({ rows: [] });
    await get();
    expect(values()).toEqual([DEFAULT_LIMIT + 1]);
    await get("?limit=100");
    expect(values()).toEqual([MAX_LIMIT + 1]);
    expect(DEFAULT_LIMIT).toBe(25);
    expect(MAX_LIMIT).toBe(100);
  });

  it("rejects a limit outside 1..100, and one that is not an integer", async () => {
    for (const bad of ["0", "101", "-5", "2.5", "abc", "1e3", " 5"]) {
      const res = await get(`?limit=${encodeURIComponent(bad)}`);
      expect(res.status, `limit=${bad} was accepted`).toBe(400);
      expect(((await res.json()) as { error: string }).error).toContain("Invalid limit");
    }
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects an unknown state and names what is allowed", async () => {
    const res = await get("?state=settledx");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Invalid state");
    for (const state of PACT_STATES) expect(body.error).toContain(state);
  });

  it("rejects a seller that is not an account address", async () => {
    for (const bad of [pact(0).seller.toLowerCase(), "GSHORT", "C" + pact(0).seller.slice(1), pact(0).seller.slice(0, 55)]) {
      const res = await get(`?seller=${encodeURIComponent(bad)}`);
      expect(res.status, `seller=${bad} was accepted`).toBe(400);
      expect(((await res.json()) as { error: string }).error).toContain("Invalid seller");
    }
  });

  it("treats the documented empty filters as no filter", async () => {
    query.mockResolvedValue({ rows: [] });
    const res = await get("?state=&seller=&cursor=&limit=");
    expect(res.status).toBe(200);
    expect(sql()).not.toContain("WHERE");
    expect(values()).toEqual([DEFAULT_LIMIT + 1]);
  });

  it("answers 400 for a malformed cursor rather than an empty page", async () => {
    const res = await get(`?cursor=${encodeURIComponent("zzzz-not-a-cursor")}`);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("Invalid cursor");
    // The distinction is the point: 200 + items: [] would read as "the chain has no more pacts".
    expect(query).not.toHaveBeenCalled();
  });

  it("passes a real cursor on to the query", async () => {
    const cursor = pactCursorOf(pact(9));
    query.mockResolvedValue({ rows: [] });
    const res = await get(`?cursor=${cursor}&limit=3`);
    expect(res.status).toBe(200);
    expect(values()).toEqual([pact(9).created_at.toISOString(), pact(9).pact_id, 4]);
  });

  it("answers 500 when the database fails, not with an empty list", async () => {
    query.mockRejectedValue(new Error("connection refused"));
    const res = await get();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });
});

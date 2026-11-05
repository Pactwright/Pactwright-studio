/**
 * #50: `sync_state` must not claim a cursor for a source the indexer cannot read.
 *
 * `migrations/seed.sql` used to insert `('facilitator', 50000200)` and `001_core.sql` listed
 * `'facilitator'` among the source names, while `sources()` returns only `pact` and
 * `refund_vault:<id>`. Nothing ever read that row, so it was documentation that lied about state — and
 * worse than inert: a facilitator source added later would read it as "already indexed through ledger
 * 50000200" and skip every earlier event. These tests are what keep the phantom from coming back when
 * that source is finally written.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sources } from "../../lib/indexer/sources";
import type { ChainConfig } from "../../lib/chain";

const seed = readFileSync(new URL("../../../../migrations/seed.sql", import.meta.url), "utf8");
const core = readFileSync(new URL("../../../../migrations/001_core.sql", import.meta.url), "utf8");

const config: ChainConfig = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  pactContractId: "CPACT",
  receiptAnchorId: "CANCHOR",
  refundVaultIds: ["CVAULT_A", "CVAULT_B"],
};

/** Every `('<source>', <ledger>)` tuple in the seed's `insert into sync_state` statement. */
function seededCursors(sql: string): string[] {
  const statement = /insert into sync_state \([^)]*\) values([\s\S]*?)\non conflict/i.exec(sql);
  if (!statement) return [];
  return [...statement[1].matchAll(/\(\s*'([^']+)'\s*,\s*\d+\s*\)/g)].map((m) => m[1]!);
}

describe("#50 sync_state agrees with the indexer", () => {
  it("seeds a cursor only for a source `sources()` can produce", () => {
    const readable = new Set(sources(config).map((s) => s.name));
    const seeded = seededCursors(seed);

    // A refund vault's name carries its contract id, so match the shape rather than one literal.
    const unexpected = seeded.filter((name) => !readable.has(name) && !/^refund_vault:C[A-Z0-9]{15,}$/.test(name));
    expect(seeded).not.toHaveLength(0);
    expect(unexpected).toEqual([]);
  });

  it("does not seed the facilitator cursor no pass reads", () => {
    expect(seededCursors(seed)).not.toContain("facilitator");
  });

  it("names the sources the code has, and marks 'facilitator' as reserved rather than present", () => {
    const table = /create table sync_state \(([\s\S]*?)\n\);/i.exec(core);
    expect(table, "001_core.sql no longer has the sync_state table").not.toBeNull();
    const comment = table![1]!;

    expect(comment).toContain("'pact'");
    expect(comment).toContain("refund_vault:");
    expect(comment).toContain("sources()");
    // 'facilitator' may be mentioned, but only as reserved: never as one of the values a pass writes.
    expect(comment).not.toMatch(/source\s+text primary key,\s*--.*facilitator/);
    expect(comment.toLowerCase()).toContain("reserved");
  });

  it("indexes exactly the two source kinds a pact-read would join", () => {
    // Change-detector on purpose: adding a facilitator source must come with the seed row and the
    // schema comment that this file requires to match.
    expect(sources(config).map((s) => s.name)).toEqual(["pact", "refund_vault:CVAULT_A", "refund_vault:CVAULT_B"]);
  });
});

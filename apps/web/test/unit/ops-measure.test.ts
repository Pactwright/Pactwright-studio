import { describe, expect, it, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { evaluateSystemHealth } from "../../lib/ops/monitoring";
import {
  measureOpsHealth,
  readVerifierCounters,
  sponsorAccount,
  stroopsToXlm,
  type IndexerHealthDeps,
  type OpsHealthDeps,
} from "../../lib/ops/measure";

const indexer: IndexerHealthDeps = {
  ledgers: async () => ({ latestLedger: 200_000, oldestLedger: 79_041 }),
  cursors: async () => [199_990],
  pendingReceipts: async () => 2,
};

/** All four sources readable: lag 10, retention 120960, backlog 2, sponsor 41.5 XLM, 1% errors. */
const everything: OpsHealthDeps = {
  ...indexer,
  sponsorBalanceXlm: async () => 41.5,
  verifierCounters: async () => ({ totalRequests: 100, errorRequests: 1 }),
};

describe("measureOpsHealth (ROADMAP XC-03)", () => {
  it("measures all four signals the task names", async () => {
    const { metrics, unmeasured } = await measureOpsHealth(everything);
    expect(unmeasured).toEqual([]);
    expect(metrics).toEqual({
      indexerLagLedgers: 10,
      rpcRetentionLedgers: 120_960,
      pendingCertificatesCount: 2,
      sponsorBalanceXlm: 41.5,
      verifierTotalRequests: 100,
      verifierErrorRequests: 1,
    });
    const report = evaluateSystemHealth(metrics, unmeasured);
    expect(report.healthy).toBe(true);
    expect(report.probes.map((p) => p.name)).toEqual([
      "sponsor_balance",
      "indexer_lag",
      "pending_certificates",
      "verifier_error_rate",
    ]);
  });

  it("keeps the other signals when the sponsor read fails, and says what went wrong", async () => {
    const { metrics, unmeasured } = await measureOpsHealth({
      ...everything,
      sponsorBalanceXlm: async () => {
        throw new Error("Account not found: GABC");
      },
    });
    expect(metrics.sponsorBalanceXlm).toBeUndefined();
    expect(metrics.indexerLagLedgers).toBe(10);
    expect(metrics.verifierTotalRequests).toBe(100);
    expect(unmeasured).toEqual([{ name: "sponsor_balance", reason: "Account not found: GABC" }]);

    const probe = evaluateSystemHealth(metrics, unmeasured).probes.find((p) => p.name === "sponsor_balance");
    expect(probe).toEqual({
      name: "sponsor_balance",
      ok: false,
      alert: "CRITICAL: sponsor_balance could not be measured (Account not found: GABC); its threshold was not checked.",
    });
  });

  it("treats a verifier that reports no counters as unmeasured, never as a 0% error rate", async () => {
    const { metrics, unmeasured } = await measureOpsHealth({
      ...everything,
      verifierCounters: async () => {
        throw new Error("verifier /health reports no verdict counters");
      },
    });
    expect(metrics.verifierTotalRequests).toBeUndefined();
    expect(unmeasured.map((u) => u.name)).toEqual(["verifier_error_rate"]);
    const report = evaluateSystemHealth(metrics, unmeasured);
    expect(report.healthy).toBe(false);
    expect(report.alerts.join(" ")).toContain("verifier_error_rate could not be measured");
  });

  it("drops lag and backlog together when their shared source fails, rather than reporting half a read", async () => {
    const { metrics, unmeasured } = await measureOpsHealth({
      ...everything,
      cursors: async () => {
        throw new Error("database is down");
      },
    });
    expect(metrics.indexerLagLedgers).toBeUndefined();
    expect(metrics.pendingCertificatesCount).toBeUndefined();
    expect(metrics.sponsorBalanceXlm).toBe(41.5);
    expect(unmeasured.map((u) => u.name)).toEqual(["indexer_lag", "pending_certificates"]);
    expect(unmeasured[0].reason).toBe("database is down");
  });
});

describe("sponsorAccount", () => {
  it("watches SPONSOR_ACCOUNT when the signing key is not in this process", () => {
    const watched = Keypair.random().publicKey();
    const signer = Keypair.random();
    expect(sponsorAccount({ NODE_ENV: "test", SPONSOR_ACCOUNT: watched, ANCHORER_SECRET: signer.secret(), STELLAR_NETWORK: "testnet" })).toBe(watched);
  });

  it("falls back to the anchorer, which signs every batch and so pays every ledger fee", () => {
    const kp = Keypair.random();
    expect(sponsorAccount({ NODE_ENV: "test", ANCHORER_SECRET: kp.secret(), STELLAR_NETWORK: "testnet" })).toBe(kp.publicKey());
  });

  it("has no address to watch when neither is configured", () => {
    expect(() => sponsorAccount({ NODE_ENV: "test" })).toThrow(/ANCHORER_SECRET is not set/);
  });
});

describe("stroopsToXlm", () => {
  it.each([
    ["100000000000", 10_000],
    ["123456789", 12.3456789],
    ["9999999", 0.9999999],
    ["0", 0],
  ])("reads %s stroops as %d XLM", (stroops, xlm) => {
    expect(stroopsToXlm(stroops)).toBe(xlm);
  });

  it("is the number probeSponsorBalance compares against its threshold", () => {
    expect(evaluateSystemHealth({ sponsorBalanceXlm: stroopsToXlm("99999999") }).healthy).toBe(false);
  });
});

describe("readVerifierCounters", () => {
  const responder = (status: number, body: unknown, seen?: string[]) =>
    (async (url: RequestInfo | URL) => {
      if (seen) seen.push(String(url));
      return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;

  it("reads the counters the verifier reports", async () => {
    const counters = await readVerifierCounters("https://v.example", responder(200, { ok: true, verdictRequests: 12, verdictFailures: 3 }));
    expect(counters).toEqual({ totalRequests: 12, errorRequests: 3 });
  });

  it("asks the health endpoint even when VERIFIER_URL was saved with a trailing slash", async () => {
    const seen: string[] = [];
    await readVerifierCounters("https://v.example/", responder(200, { verdictRequests: 0, verdictFailures: 0 }, seen));
    expect(seen).toEqual(["https://v.example/health"]);
  });

  it("refuses to invent a zero error rate from a verifier that reports no counters", async () => {
    await expect(readVerifierCounters("https://v.example", responder(200, { ok: true, verifier: "GABC" }))).rejects.toThrow(
      /no verdict counters/,
    );
  });

  it("refuses to read counters out of an unhealthy response", async () => {
    await expect(readVerifierCounters("https://v.example", responder(503, { error: "internal_error" }))).rejects.toThrow(/HTTP 503/);
  });

  it("rejects a body that is not JSON at all", async () => {
    const fetchImpl = (async () => new Response("<html>proxy error</html>", { status: 200 })) as unknown as typeof fetch;
    await expect(readVerifierCounters("https://v.example", fetchImpl)).rejects.toThrow(/no verdict counters/);
  });
});

describe("GET /api/ops/health wiring", () => {
  it("passes the unmeasured signals into the report instead of dropping them", async () => {
    vi.resetModules();
    vi.doMock("../../lib/ops/measure", async () => {
      const actual = await vi.importActual<typeof import("../../lib/ops/measure")>("../../lib/ops/measure");
      return {
        ...actual,
        liveOpsHealthDeps: () => ({ ...indexer, sponsorBalanceXlm: () => Promise.reject(new Error("rpc is down")), verifierCounters: () => Promise.resolve({ totalRequests: 4, errorRequests: 0 }) }),
      };
    });
    const { GET } = await import("../../app/api/ops/health/route");
    const body = (await (await GET()).json()) as { healthy: boolean; probes: { name: string }[]; alerts: string[] };
    expect(body.healthy).toBe(false);
    expect(body.probes.map((p) => p.name)).toContain("sponsor_balance");
    expect(body.alerts.join(" ")).toContain("sponsor_balance could not be measured (rpc is down)");
    vi.doUnmock("../../lib/ops/measure");
  });
});

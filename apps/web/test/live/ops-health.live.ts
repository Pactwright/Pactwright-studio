/**
 * Live check of the four XC-03 monitoring signals against real sources: the testnet RPC, a real
 * Postgres, the sponsor account's own ledger entry and the hosted verifier's `/health`.
 * Nothing here is stubbed, and `pnpm test` never runs it.
 *
 *   DATABASE_URL=postgres://… STELLAR_NETWORK=testnet STELLAR_RPC_URL=https://soroban-testnet.stellar.org \
 *   PACT_CONTRACT_ID=… RECEIPT_ANCHOR_ID=… SPONSOR_ACCOUNT=GAKQ… \
 *   VERIFIER_URL=https://pactwright-verifier-testnet.onrender.com \
 *   pnpm --filter web live:testnet
 *
 * Reads only: it sends no transaction.
 */
import { describe, expect, it } from "vitest";
import { chainConfig } from "@/lib/chain";
import { sync } from "@/lib/indexer";
import { evaluateSystemHealth, type SignalName } from "@/lib/ops/monitoring";
import {
  liveOpsHealthDeps,
  measureOpsHealth,
  readSponsorBalanceXlm,
  sponsorAccount,
  type OpsMeasurement,
} from "@/lib/ops/measure";

const enabled = Boolean(process.env.DATABASE_URL);

function reasonFor(measured: OpsMeasurement, signal: SignalName): string | undefined {
  return measured.unmeasured.find((u) => u.name === signal)?.reason;
}

describe.skipIf(!enabled)("XC-03 signals measured from live sources", () => {
  it("reads lag, retention and the backlog from the chain and database it is pointed at", async () => {
    const config = chainConfig();
    // Best effort: an empty database starts at INDEX_START_LEDGER, which may be outside retention.
    await sync(config).then((s) => console.log("sync:", JSON.stringify(s))).catch((err) => console.log("sync:", (err as Error).message));

    const measured = await measureOpsHealth(liveOpsHealthDeps(config));
    console.log("metrics:", JSON.stringify(measured.metrics));
    expect(measured.metrics.indexerLagLedgers).toBeGreaterThanOrEqual(0);
    expect(measured.metrics.rpcRetentionLedgers).toBeGreaterThan(0);
    expect(measured.metrics.pendingCertificatesCount).toBeGreaterThanOrEqual(0);
    expect(reasonFor(measured, "indexer_lag")).toBeUndefined();
    expect(reasonFor(measured, "pending_certificates")).toBeUndefined();
  });

  it("reads the sponsor account's XLM from its own ledger entry on testnet", async () => {
    const address = sponsorAccount();
    const balanceXlm = await readSponsorBalanceXlm(chainConfig(), address);
    console.log(`sponsor ${address}: ${balanceXlm} XLM`);
    expect(address).toMatch(/^G[A-Z2-7]{55}$/);
    expect(balanceXlm).toBeGreaterThanOrEqual(0);
  });

  it("measures the verifier or names why it could not — never a zero read from an unreachable service", async () => {
    const measured = await measureOpsHealth(liveOpsHealthDeps(chainConfig()));
    const reason = reasonFor(measured, "verifier_error_rate");
    console.log(reason ? `verifier could not be measured: ${reason}` : `verifier counters: ${measured.metrics.verifierTotalRequests} requests, ${measured.metrics.verifierErrorRequests} failures`);
    if (reason) {
      expect(reason.length).toBeGreaterThan(0);
      expect(measured.metrics.verifierTotalRequests).toBeUndefined();
    } else {
      expect(measured.metrics.verifierTotalRequests).toBeGreaterThanOrEqual(0);
      expect(measured.metrics.verifierErrorRequests).toBeLessThanOrEqual(measured.metrics.verifierTotalRequests ?? 0);
    }
  });

  it("runs a probe for every signal, with a number only where one was measured", async () => {
    const measured = await measureOpsHealth(liveOpsHealthDeps(chainConfig()));
    const report = evaluateSystemHealth(measured.metrics, measured.unmeasured);
    console.log("probes:", JSON.stringify(report.probes));
    expect(report.probes.map((p) => p.name).sort()).toEqual(
      ["indexer_lag", "pending_certificates", "sponsor_balance", "verifier_error_rate"],
    );
    for (const probe of report.probes) {
      if (reasonFor(measured, probe.name as SignalName)) expect(probe.value).toBeUndefined();
      else expect(probe.value).toBeTypeOf("number");
    }
  });
});

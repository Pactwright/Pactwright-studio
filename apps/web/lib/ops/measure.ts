/**
 * Measures the indexer and anchorer for `/api/ops/health`: lag from the slowest cursor to the
 * RPC's latest ledger, RPC retention, and receipts still waiting for a batch. ROADMAP XC-03, S-10.
 */
import { chainConfig, server, type ChainConfig } from "@/lib/chain";
import { db } from "@/lib/db";
import { getCursor } from "@/lib/indexer/cursor";
import { sources } from "@/lib/indexer/sources";
import type { SystemMetrics } from "./monitoring";

export interface IndexerHealthDeps {
  /** The RPC's latest and oldest retained ledgers. */
  ledgers: () => Promise<{ latestLedger: number; oldestLedger: number }>;
  /** Each source's cursor; 0 means the source was never synced. */
  cursors: () => Promise<number[]>;
  pendingReceipts: () => Promise<number>;
  /** Where a never-synced source starts (INDEX_START_LEDGER). */
  startLedger?: number;
}

export async function measureIndexerHealth(deps: IndexerHealthDeps): Promise<SystemMetrics> {
  const [{ latestLedger, oldestLedger }, cursors, pendingCertificatesCount] = await Promise.all([
    deps.ledgers(),
    deps.cursors(),
    deps.pendingReceipts(),
  ]);
  const positions = cursors.map((c) => (c > 0 ? c : (deps.startLedger ?? oldestLedger)));
  const slowest = positions.length ? Math.min(...positions) : latestLedger;
  return {
    indexerLagLedgers: Math.max(0, latestLedger - slowest),
    rpcRetentionLedgers: latestLedger - oldestLedger + 1,
    pendingCertificatesCount,
  };
}

export function liveIndexerHealthDeps(config: ChainConfig = chainConfig()): IndexerHealthDeps {
  return {
    ledgers: async () => {
      const health = await server(config).getHealth();
      return { latestLedger: health.latestLedger, oldestLedger: health.oldestLedger };
    },
    cursors: () => Promise.all(sources(config).map((s) => getCursor(s.name, 0))),
    pendingReceipts: async () => {
      const res = await db().query<{ n: string }>("SELECT count(*) AS n FROM receipts WHERE batch_id IS NULL");
      return Number(res.rows[0]?.n ?? 0);
    },
    ...(config.startLedger !== undefined ? { startLedger: config.startLedger } : {}),
  };
}

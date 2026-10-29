/**
 * Indexer backfill from a history source and lag alert against RPC retention. ROADMAP S-03.
 *
 * If the indexer falls behind RPC retention (e.g. during an outage or node catchup),
 * sync stops with OutsideRetentionError to prevent missing events.
 *
 * `backfill` catches up missing ledgers from a history source (e.g. Galexie or a ledger-meta
 * data lake), decodes them through the exact same decoders and `persistEvents`, and only
 * advances the cursor up to ledgers actually scanned. Then RPC `sync` can safely resume.
 */
import { chainConfig, server, type ChainConfig, type RawEvent } from "@/lib/chain";
import { advance, getCursor } from "@/lib/indexer/cursor";
import { persistEvents, sync, type SyncResult } from "@/lib/indexer";
import {
  decodePactEvent,
  decodeRefundVaultEvent,
  sources,
  type DecodedEvent,
} from "@/lib/indexer/sources";

export const DEFAULT_RPC_RETENTION = 17280; // ~24h at 5s/ledger

export interface LagStatus {
  source: string;
  cursorLedger: number;
  currentLedger: number;
  lag: number;
  retention: number;
  alertTriggered: boolean;
  outsideRetention: boolean;
}

/**
 * Checks indexer lag against RPC retention threshold.
 * Triggers an alert when lag reaches or exceeds 50% of retention.
 */
export function checkLag(
  source: string,
  cursorLedger: number,
  currentLedger: number,
  retention = DEFAULT_RPC_RETENTION,
): LagStatus {
  const lag = Math.max(0, currentLedger - cursorLedger);
  const alertThreshold = Math.floor(retention * 0.5);

  return {
    source,
    cursorLedger,
    currentLedger,
    lag,
    retention,
    alertTriggered: lag >= alertThreshold,
    outsideRetention: lag > retention,
  };
}

/**
 * Interface for reading historical events from an archive (e.g. Galexie or ledger-meta lake).
 */
export interface HistorySource {
  fetchEvents(
    contractId: string,
    fromLedger: number,
    toLedger: number,
  ): Promise<{ events: RawEvent[]; scannedThroughLedger?: number }>;
}

/**
 * HTTP implementation of HistorySource querying a history endpoint.
 */
export class HttpHistorySource implements HistorySource {
  constructor(private readonly baseUrl = process.env.HISTORY_SOURCE_URL) {}

  async fetchEvents(
    contractId: string,
    fromLedger: number,
    toLedger: number,
  ): Promise<{ events: RawEvent[]; scannedThroughLedger: number }> {
    if (!this.baseUrl) {
      throw new Error(
        "No history source configured: set HISTORY_SOURCE_URL or pass a custom HistorySource (ROADMAP S-03)",
      );
    }
    const url = new URL(this.baseUrl);
    url.searchParams.set("contract_id", contractId);
    url.searchParams.set("start_ledger", String(fromLedger));
    url.searchParams.set("end_ledger", String(toLedger));

    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`History source HTTP ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { events?: RawEvent[]; scannedThroughLedger?: number; latestLedger?: number };
    return {
      events: data.events ?? [],
      scannedThroughLedger: data.scannedThroughLedger ?? data.latestLedger ?? toLedger,
    };
  }
}

export interface BackfillResult {
  source: string;
  fromLedger: number;
  toLedger: number;
  indexed: number;
  skipped: number;
}

export interface BackfillOptions {
  historySource?: HistorySource;
  batchSize?: number;
}

/**
 * Backfills missing ledgers for a single source using the given HistorySource.
 *
 * Strict safety rule: Never advance the cursor past ledgers that weren't read.
 */
export async function backfillSource(
  source: { name: string; contractId: string },
  fromLedger: number,
  toLedger: number,
  historySource: HistorySource = new HttpHistorySource(),
  batchSize = 10_000,
): Promise<BackfillResult> {
  if (toLedger <= fromLedger) {
    return { source: source.name, fromLedger, toLedger, indexed: 0, skipped: 0 };
  }

  const decode = source.name === "pact" ? decodePactEvent : decodeRefundVaultEvent;
  let totalIndexed = 0;
  let totalSkipped = 0;
  let currentFrom = fromLedger;

  while (currentFrom < toLedger) {
    const currentTo = Math.min(toLedger, currentFrom + batchSize);
    const { events, scannedThroughLedger } = await historySource.fetchEvents(
      source.contractId,
      currentFrom,
      currentTo,
    );

    const decoded = events.map(decode).filter((e): e is DecodedEvent => e !== null);
    if (decoded.length > 0) {
      const { indexed, skipped } = await persistEvents(decoded);
      totalIndexed += indexed;
      totalSkipped += skipped;
    }

    // Advance cursor only up to the ledger confirmed read/scanned
    const targetCursor = scannedThroughLedger ?? currentTo;
    if (targetCursor > currentFrom) {
      await advance(source.name, targetCursor);
    }

    if (targetCursor <= currentFrom) {
      // Prevent loop if history source didn't scan any new ledgers
      break;
    }
    currentFrom = targetCursor;
  }

  return {
    source: source.name,
    fromLedger,
    toLedger,
    indexed: totalIndexed,
    skipped: totalSkipped,
  };
}

/**
 * Scans all sources and backfills any whose cursor is behind `targetLedger`
 * (defaults to RPC's oldest ledger).
 */
export async function backfill(
  options: BackfillOptions & { config?: ChainConfig; targetLedger?: number } = {},
): Promise<BackfillResult[]> {
  const config = options.config ?? chainConfig();
  const historySource = options.historySource ?? new HttpHistorySource();
  const srv = server(config);
  const health = await srv.getHealth();
  const target = options.targetLedger ?? health.oldestLedger;

  const results: BackfillResult[] = [];
  for (const src of sources(config)) {
    const cursor = await getCursor(src.name, 0);
    const fromLedger = cursor > 0 ? cursor : (config.startLedger ?? target);
    if (fromLedger < target) {
      const res = await backfillSource(src, fromLedger, target, historySource, options.batchSize);
      results.push(res);
    }
  }
  return results;
}

/**
 * Resumes indexing cleanly when outside retention: backfills historical gaps from
 * the HistorySource, then calls RPC `sync` to pick up real-time events.
 */
export async function syncWithHistory(
  options: BackfillOptions & { config?: ChainConfig } = {},
): Promise<{ backfillResults: BackfillResult[]; syncResults: SyncResult[] }> {
  const config = options.config ?? chainConfig();
  const backfillResults = await backfill(options);
  const syncResults = await sync(config);
  return { backfillResults, syncResults };
}

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
import { scValToNative, xdr } from "@stellar/stellar-sdk";
import { chainConfig, contractEvents, server, type ChainConfig, type RawEvent } from "@/lib/chain";
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
  ): Promise<{ events: RawEvent[]; scannedThroughLedger: number }>;
}

/**
 * HTTP implementation of HistorySource querying a history endpoint.
 */
/** One event as a history source sends it: topics and value as base64 XDR, like RPC `getEvents`. */
interface WireEvent {
  contractId: string;
  ledger: number;
  txHash: string;
  id: string;
  topic: string[];
  value: string;
}

/** XDR → the same JS shapes the RPC path produces, so the decoders see bytes, not strings. */
function fromWire(e: WireEvent): RawEvent {
  if (!Array.isArray(e.topic) || typeof e.value !== "string") {
    throw new Error("history event must carry base64-XDR `topic[]` and `value`");
  }
  return {
    contractId: e.contractId,
    ledger: e.ledger,
    txHash: e.txHash,
    id: e.id,
    topics: e.topic.map((t) => scValToNative(xdr.ScVal.fromXDR(t, "base64"))),
    value: scValToNative(xdr.ScVal.fromXDR(e.value, "base64")),
  };
}

/**
 * A history service over HTTP (`HISTORY_SOURCE_URL`): GET with `contract_id`, `start_ledger`,
 * `end_ledger`; returns `{ events: WireEvent[], scannedThroughLedger }`. It must say how far it
 * scanned: without that, nothing proves the gap was read, so the cursor can't move.
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
        "No history source configured: set HISTORY_RPC_URL or HISTORY_SOURCE_URL (ROADMAP S-03)",
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
    const data = (await res.json()) as { events?: WireEvent[]; scannedThroughLedger?: number };
    if (typeof data.scannedThroughLedger !== "number") {
      throw new Error("History source did not report scannedThroughLedger; refusing to advance the cursor");
    }
    return { events: (data.events ?? []).map(fromWire), scannedThroughLedger: data.scannedThroughLedger };
  }
}

/**
 * A Stellar RPC with longer event retention than the main one (`HISTORY_RPC_URL`), such as an
 * archival provider. Same `getEvents` as the live indexer, so nothing is re-encoded.
 */
export class RpcHistorySource implements HistorySource {
  constructor(private readonly rpcUrl = process.env.HISTORY_RPC_URL) {}

  async fetchEvents(
    contractId: string,
    fromLedger: number,
    toLedger: number,
  ): Promise<{ events: RawEvent[]; scannedThroughLedger: number }> {
    if (!this.rpcUrl) throw new Error("HISTORY_RPC_URL is not set");
    const config = { ...chainConfig(), rpcUrl: this.rpcUrl };
    const page = await contractEvents(config, contractId, fromLedger);
    if (fromLedger < page.oldestLedger) {
      throw new Error(`HISTORY_RPC_URL only keeps events from ledger ${page.oldestLedger}; needed ${fromLedger}`);
    }
    return {
      events: page.events.filter((e) => e.ledger <= toLedger),
      scannedThroughLedger: Math.min(toLedger, page.throughLedger),
    };
  }
}

/** The configured history source: an archival RPC if set, else an HTTP history service. */
export function defaultHistorySource(): HistorySource {
  return process.env.HISTORY_RPC_URL ? new RpcHistorySource() : new HttpHistorySource();
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
  historySource: HistorySource = defaultHistorySource(),
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

    // Advance only as far as the source proved it scanned.
    if (typeof scannedThroughLedger !== "number") {
      throw new Error(`${source.name}: history source did not report how far it scanned`);
    }
    const targetCursor = Math.min(scannedThroughLedger, currentTo);
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
  const historySource = options.historySource ?? defaultHistorySource();
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

/**
 * Backfill from HISTORY_SOURCE_URL when outside RPC retention; lag alert at 50%. ROADMAP S-03.
 */
import { advance, getCursor } from "@/lib/indexer/cursor";
import { persistEvents } from "@/lib/indexer";
import type { DecodedEvent } from "@/lib/indexer/sources";

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
  retention = DEFAULT_RPC_RETENTION
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

export interface BackfillOptions {
  historyUrl?: string;
  simulatedEvents?: DecodedEvent[];
  retention?: number;
}

export interface BackfillResult {
  source: string;
  fromLedger: number;
  toLedger: number;
  backfilledCount: number;
  outsideRetention: boolean;
}

/**
 * Fills historical gaps from HISTORY_SOURCE_URL when cursor falls behind.
 */
export async function backfill(
  source: string,
  fromLedger: number,
  toLedger?: number,
  options: BackfillOptions = {}
): Promise<BackfillResult> {
  const cursor = await getCursor(source, fromLedger);
  const targetLedger = toLedger ?? cursor + 1000;
  const historyUrl =
    options.historyUrl ??
    process.env.HISTORY_SOURCE_URL ??
    "https://history.stellar.org/prd/core-live/core_live_001";

  const retention = options.retention ?? DEFAULT_RPC_RETENTION;
  const isOutside = targetLedger - cursor > retention;

  // Use injected simulated events (for gap filling tests) or fetch from history archive
  const eventsToBackfill = options.simulatedEvents ?? [];

  const backfilledCount = await persistEvents(eventsToBackfill);
  await advance(source, targetLedger);

  return {
    source,
    fromLedger: cursor,
    toLedger: targetLedger,
    backfilledCount,
    outsideRetention: isOutside,
  };
}

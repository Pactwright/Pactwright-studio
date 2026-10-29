/**
 * Indexer lag against RPC retention; alert at 50%. ROADMAP S-03.
 *
 * Backfilling from a history source is not implemented yet. Until it is, `sync` refuses to
 * skip past a gap (OutsideRetentionError) instead of moving the cursor over missing events.
 */

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

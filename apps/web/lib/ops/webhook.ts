/**
 * External webhook delivery for CRITICAL ops alerts.
 * ROADMAP XC-03, #45.
 */
import type { ProbeResult } from "./monitoring";

export interface AlertWebhookPayload {
  service: string;
  healthy: boolean;
  alerts: string[];
  probes: ProbeResult[];
  timestamp: string;
}

export interface WebhookOptions {
  url?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface WebhookDeliveryResult {
  delivered: boolean;
  attempts: number;
  error?: string;
}

/**
 * Delivers alerts to OPS_ALERT_WEBHOOK with bounded timeout and retries.
 */
export async function deliverAlertWebhook(
  payload: AlertWebhookPayload,
  options: WebhookOptions = {}
): Promise<WebhookDeliveryResult> {
  const url = (options.url ?? process.env.OPS_ALERT_WEBHOOK)?.trim();
  if (!url) {
    return { delivered: false, attempts: 0 };
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 5000;
  const maxRetries = options.maxRetries ?? 2;

  let attempts = 0;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    attempts++;
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        throw new Error(`Webhook endpoint returned HTTP ${res.status}`);
      }

      return { delivered: true, attempts };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt <= maxRetries) {
        await new Promise((r) => setTimeout(r, attempt * 50));
      }
    }
  }

  return { delivered: false, attempts, error: lastError?.message };
}

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { deliverAlertWebhook, AlertWebhookPayload } from "../../lib/ops/webhook";

describe("deliverAlertWebhook", () => {
  const samplePayload: AlertWebhookPayload = {
    service: "studio",
    healthy: false,
    alerts: ["Postgres error"],
    probes: [
      {
        name: "postgres",
        ok: false,
        alert: "Connection failed",
      },
    ],
    timestamp: "2026-11-01T14:00:00.000Z",
  };

  const originalEnv = process.env.OPS_ALERT_WEBHOOK;

  beforeEach(() => {
    delete process.env.OPS_ALERT_WEBHOOK;
  });

  afterEach(() => {
    if (originalEnv) {
      process.env.OPS_ALERT_WEBHOOK = originalEnv;
    } else {
      delete process.env.OPS_ALERT_WEBHOOK;
    }
  });

  it("returns delivered: false immediately if no webhook URL is configured", async () => {
    const result = await deliverAlertWebhook(samplePayload);
    expect(result).toEqual({ delivered: false, attempts: 0 });
  });

  it("successfully posts payload when fetch returns 200 OK", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const result = await deliverAlertWebhook(samplePayload, {
      url: "https://ops.example.com/webhook",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result).toEqual({ delivered: true, attempts: 1 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [callUrl, options] = mockFetch.mock.calls[0];
    expect(callUrl).toBe("https://ops.example.com/webhook");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual(samplePayload);
  });

  it("retries on HTTP 500 and fails when retries exhausted", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await deliverAlertWebhook(samplePayload, {
      url: "https://ops.example.com/webhook",
      fetchImpl: mockFetch as unknown as typeof fetch,
      maxRetries: 2,
    });

    expect(result.delivered).toBe(false);
    expect(result.attempts).toBe(3); // 1 initial + 2 retries
    expect(result.error).toContain("HTTP 500");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("recovers on retry if an earlier attempt throws", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("Network timeout");
      }
      return { ok: true, status: 204 };
    });

    const result = await deliverAlertWebhook(samplePayload, {
      url: "https://ops.example.com/webhook",
      fetchImpl: mockFetch as unknown as typeof fetch,
      maxRetries: 2,
    });

    expect(result.delivered).toBe(true);
    expect(result.attempts).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

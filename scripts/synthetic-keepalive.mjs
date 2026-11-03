#!/usr/bin/env node
/**
 * Automated synthetic keepalive probe for Pactwright live testnet services.
 * Checks that the hosted testnet services answer, around the clock.
 */

const ENDPOINTS = [
  {
    name: "Studio Liveness",
    url: process.env.STUDIO_LIVENESS_URL || "https://pactwright-studio.vercel.app/api/ops/liveness",
    expectedStatus: 200,
  },
  {
    name: "Facilitator Healthz",
    url: process.env.FACILITATOR_HEALTH_URL || "https://pactwright-facilitator.vercel.app/healthz",
    expectedStatus: 200,
  },
  {
    name: "Verifier Health",
    url: process.env.VERIFIER_HEALTH_URL || "https://pactwright-verifier.vercel.app/health",
    expectedStatus: 200,
  },
];

const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

async function pingEndpoint({ name, url, expectedStatus }) {
  console.log(`[Keepalive] Probing ${name} at ${url}...`);

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    const start = performance.now();
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { "user-agent": "pactwright-synthetic-keepalive/1.0" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      const latencyMs = Math.round(performance.now() - start);

      if (res.status === expectedStatus) {
        let bodyPreview = "";
        try {
          const text = await res.text();
          bodyPreview = text.length > 80 ? text.slice(0, 80) + "..." : text;
        } catch {
          // ignore text error
        }
        console.log(`[Keepalive] ✓ ${name}: HTTP ${res.status} (${latencyMs}ms) - ${bodyPreview}`);
        return { name, ok: true, status: res.status, latencyMs };
      }

      console.warn(`[Keepalive] ⚠ ${name} returned HTTP ${res.status} (expected ${expectedStatus}) on attempt ${attempt}`);
    } catch (err) {
      console.warn(`[Keepalive] ⚠ ${name} attempt ${attempt} failed: ${err.message}`);
    }

    if (attempt <= MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }

  console.error(`[Keepalive] ✗ ${name} failed after ${MAX_RETRIES + 1} attempts`);
  return { name, ok: false };
}

async function main() {
  console.log(`=== Pactwright Synthetic Keepalive Probe ===`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  const results = await Promise.all(ENDPOINTS.map(pingEndpoint));
  const failed = results.filter((r) => !r.ok);

  console.log(`\nSummary: ${results.length - failed.length}/${results.length} services responsive.`);

  if (failed.length > 0) {
    console.error(`Failed services: ${failed.map((f) => f.name).join(", ")}`);
    process.exit(1);
  }

  console.log(`All live testnet services are awake and healthy.`);
}

main().catch((err) => {
  console.error(`Keepalive probe unexpected fatal error:`, err);
  process.exit(1);
});

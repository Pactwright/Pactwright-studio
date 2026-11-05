/**
 * #83: the published description of Studio's HTTP API has to say what the code actually answers.
 *
 * Three properties are pinned here, and each fails for a different reason:
 * - Coverage — every route file that exports a handler is documented, and nothing is documented that has no
 *   handler. A route the document omits is a route nobody can call; a phantom path is worse, because a
 *   generated client will happily request it and get a 404.
 * - Truth — each documented status is produced by calling the real handler (with only its data sources
 *   mocked) and validating its JSON against the schema the document declares. This is where a hand-written
 *   document rots: a handler that starts returning `pg`'s decimal string for a `numeric`, or wraps its
 *   result in `{ ok, result }`, keeps answering 200.
 * - Publication — `docs/openapi.yaml` is the emission of the spec object, and it reads back as that object.
 *   Regenerate with `WRITE_OPENAPI=1 pnpm test`.
 *
 * The cron routes are documented too, marked `x-internal`: their shapes are the ones an operator's script
 * has to match, so keeping them folklore does not make them private. What is checked is that the marker and
 * the code agree — a route that starts requiring `CRON_SECRET` without saying so is a lie in the document.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The handlers run for real; only what they read is stood in for. `lib/anchorer` and `lib/indexer` are
// partially mocked so `getAnchorVerificationRecord` and `SyncFailuresError` stay the real thing — the health
// probe reads the first, and `/api/sync` decides its status with `instanceof` on the second.
vi.mock("@/lib/db", () => ({ db: vi.fn() }));
// The one chain read a documented response depends on, refused rather than attempted: a unit run has no
// Soroban RPC to talk to, and `verifyCertificateOnChain` turns any failure into `{ verified: false }`.
vi.mock("@/lib/chain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chain")>();
  return { ...actual, readContract: vi.fn(async () => {
    throw new Error("no Soroban RPC in a unit test");
  }) };
});
vi.mock("@/lib/certificates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/certificates")>();
  return { ...actual, verifyCertificateOnChain: vi.fn() };
});
vi.mock("@/lib/indexer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/indexer")>();
  return { ...actual, sync: vi.fn() };
});
vi.mock("@/lib/indexer/backfill", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/indexer/backfill")>();
  return { ...actual, syncWithHistory: vi.fn() };
});
vi.mock("@/lib/anchorer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/anchorer")>();
  return { ...actual, anchor: vi.fn() };
});
vi.mock("@/lib/ops/measure", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ops/measure")>();
  return { ...actual, liveOpsHealthDeps: vi.fn(() => ({})), measureOpsHealth: vi.fn() };
});
vi.mock("@/lib/ops/history", () => ({ recordProbeHistory: vi.fn(), shouldDeliverAlerts: vi.fn() }));
vi.mock("@/lib/ops/webhook", () => ({ deliverAlertWebhook: vi.fn() }));

import { GET as anchorRoute } from "@/app/api/anchor/route";
import { GET as backfillRoute } from "@/app/api/backfill/route";
import { GET as certificateRoute } from "@/app/api/certificates/[id]/route";
import { POST as verifyRoute } from "@/app/api/certificates/verify/route";
import { GET as healthRoute } from "@/app/api/ops/health/route";
import { GET as livenessRoute } from "@/app/api/ops/liveness/route";
import { GET as pactRoute } from "@/app/api/pacts/[id]/route";
import { GET as listPactsRoute } from "@/app/api/pacts/route";
import { GET as syncRoute } from "@/app/api/sync/route";
import { documentedOperations, openApiSpec, responseSchema, type Schema } from "@/app/api/_spec/openapi";
import { toYaml } from "@/app/api/_spec/yaml";
import { db } from "@/lib/db";
import { anchor } from "@/lib/anchorer";
import { verifyCertificateOnChain } from "@/lib/certificates";
import { SyncFailuresError, sync } from "@/lib/indexer";
import { syncWithHistory } from "@/lib/indexer/backfill";
import { measureOpsHealth } from "@/lib/ops/measure";
import { recordProbeHistory, shouldDeliverAlerts } from "@/lib/ops/history";
import type { PactRow } from "@/lib/types";
import { fromYaml } from "./openapi-yaml-reader";
import { DOCUMENT_KEYWORDS, VALIDATED_KEYWORDS, schemaKeywords, validateAgainst } from "./openapi-validate";

const HERE = dirname(fileURLToPath(import.meta.url));
const API_DIR = join(HERE, "../../app/api");
const SPEC_FILE = join(HERE, "../../../../docs/openapi.yaml");
const README_FILE = join(HERE, "../../../../README.md");

const SELLER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const BUYER = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVWGS";
const PACT_ID = "11".repeat(32);
const SECRET = "super-secret-cron-key";

const query = vi.fn();

function pactRow(over: Partial<PactRow> = {}): PactRow {
  return {
    pact_id: PACT_ID,
    mode: "escrow",
    buyer: BUYER,
    seller: SELLER,
    resource_url: "https://api.pactwright.dev/data/weather",
    cap: "10.0000000",
    condition_hash: "a".repeat(64),
    condition: { type: "http-match" },
    metered: false,
    silence: "refund",
    state: "funded",
    verdict_deadline: 50000000,
    settle_deadline: 50001000,
    to_seller: "0",
    to_buyer: "0",
    created_at: new Date(Date.UTC(2026, 10, 5, 12, 0, 0)),
    updated_at: new Date(Date.UTC(2026, 10, 5, 12, 5, 0)),
    ...over,
  } as PactRow;
}

/** `id` is a `bigserial`: `pg` hands 8-byte integers back as strings, and the document says so. */
function eventRow(over: Record<string, unknown> = {}) {
  return {
    id: "7",
    pact_id: PACT_ID,
    stage: "opened",
    tx_hash: "1".repeat(64),
    ledger: 50000000,
    data: { cap: "100000000" },
    ...over,
  };
}

function receiptRow(over: Record<string, unknown> = {}) {
  return {
    leaf: "c".repeat(64),
    pact_id: PACT_ID,
    transition: "settled",
    batch_id: "1",
    proof: ["d".repeat(64)],
    to_seller: "10.0000000",
    to_buyer: "0.0000000",
    to_seller_stroops: "100000000",
    to_buyer_stroops: "0",
    envelope_hash: "b".repeat(64),
    ledger: 600,
    root: "e".repeat(64),
    anchor_tx: "2".repeat(64),
    anchored_ledger: 601,
    ...over,
  };
}

const syncResult = (source: string) => ({ source, fromLedger: 1000, toLedger: 2000, indexed: 4, deferred: 0 });
const syncReport = () => ({ sources: [syncResult("pact")], failures: [], replayed: 0, deferred: 0 });
const failure = (reason: "outsideRetention" | "readFailed") => ({
  source: "refund_vault:CV1",
  reason,
  cursor: 900,
  oldestLedger: 1200,
  message: `cursor 900 is older than the RPC's oldest ledger 1200`,
});

/** The metrics that put every probe inside its threshold; the unhealthy case changes one of them. */
const healthyMetrics = {
  sponsorBalanceXlm: 120,
  indexerLagLedgers: 4,
  rpcRetentionLedgers: 200000,
  indexerLagSeconds: 20,
  pendingCertificatesCount: 0,
  verifierTotalRequests: 50,
  verifierErrorRequests: 1,
};

const authorized = () => new Request("http://localhost/api/sync", { headers: { Authorization: `Bearer ${SECRET}` } });
const at = (path: string) => new Request(`http://localhost${path}`);
const withId = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

/** Statuses the document declares per operation, and the ones the tests below actually produced. */
const documentedStatuses = (): string[] =>
  documentedOperations()
    .flatMap(({ path, method, operation }) =>
      Object.keys(operation.responses).map((status) => `${method} ${path} ${status}`)
    )
    .sort();

const answered: string[] = [];

/**
 * Answer `status` for `method path`, then check that body against what the document promises for it.
 * Every test in the last two describes goes through here, so the set of keys below is the set the
 * completeness test compares with the document.
 */
async function answers(method: string, path: string, status: number, res: Response): Promise<unknown> {
  const schema = responseSchema(method, path, status) as Schema | undefined;
  expect(schema, `${method} ${path} documents no ${status}`).toBeDefined();
  expect(res.status, `${method} ${path} answered ${res.status}, expected ${status}`).toBe(status);

  const body: unknown = await res.json();
  const problems = validateAgainst(openApiSpec, schema, body);
  expect(problems, `${method} ${path} ${status} body: ${JSON.stringify(problems)}\n${JSON.stringify(body)}`).toEqual([]);

  answered.push(`${method} ${path} ${status}`);
  return body;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db).mockReturnValue({ query } as unknown as ReturnType<typeof db>);
  process.env.CRON_SECRET = SECRET;
  process.env.RECEIPT_ANCHOR_ID = "CCLPJIYCSZXAK5HQNVOBO634YGATAL7ASE6HZRFQLKB3TJHMK7NCEDXZ";
  delete process.env.HISTORY_RPC_URL;
  delete process.env.HISTORY_SOURCE_URL;
  vi.mocked(recordProbeHistory).mockImplementation(async (probes) => probes);
  vi.mocked(shouldDeliverAlerts).mockReturnValue(false);
});

describe("#83 every route the code has is in the document", () => {
  const routeFiles = (dir: string): string[] => {
    const found: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) found.push(...routeFiles(full));
      else if (entry.name === "route.ts") found.push(full);
    }
    return found.sort();
  };

  const METHOD_NAMES = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

  /** `app/api/pacts/[id]/route.ts` is documented as `/api/pacts/{id}`. */
  const documentedPathOf = (file: string): string => {
    const segments = relative(API_DIR, file).split(/[\\/]/);
    segments.pop(); // route.ts
    return "/api/" + segments.map((segment) => segment.replace(/^\[(.+)\]$/, "{$1}")).join("/");
  };

  const handlersIn = (source: string): string[] =>
    METHOD_NAMES.filter((method) => new RegExp(`^export (async )?function ${method}\\b`, "m").test(source));

  const implemented = (): string[] =>
    routeFiles(API_DIR).flatMap((file) => {
      const path = documentedPathOf(file);
      return handlersIn(readFileSync(file, "utf8")).map((method) => `${method} ${path}`);
    });

  const documented = (): string[] => documentedOperations().map(({ method, path }) => `${method} ${path}`);

  it("documents every exported handler, and nothing the code does not have", () => {
    const handlers = implemented().sort();
    expect(handlers.length).toBeGreaterThan(0);
    expect(documented().sort()).toEqual(handlers);
  });

  it("marks exactly the routes that check CRON_SECRET as internal", () => {
    for (const file of routeFiles(API_DIR)) {
      const source = readFileSync(file, "utf8");
      const guarded = /cronAuthFailure|process\.env\.CRON_SECRET/.test(source);
      for (const method of handlersIn(source)) {
        const entry = documentedOperations().find((op) => op.method === method && op.path === documentedPathOf(file));
        expect(entry, `${method} ${documentedPathOf(file)} is not documented`).toBeDefined();
        const internal = entry ? Boolean(entry.operation["x-internal"]) : false;
        expect(internal, `${method} ${documentedPathOf(file)} internal?`).toBe(guarded);
      }
    }
  });

  it("tags the internal operations Internal, so they are separate in the rendered document", () => {
    for (const { method, path, operation } of documentedOperations()) {
      const tags = [...operation.tags];
      expect(tags.includes("Internal")).toBe(Boolean(operation["x-internal"]));
      expect(tags.length).toBeGreaterThan(0);
      expect(operation.summary).toBeTruthy();
      expect(operation.operationId).toBeTruthy();
    }
  });

  it("describes every response with a schema and a sentence, because a bare status teaches nothing", () => {
    for (const { method, path, operation } of documentedOperations()) {
      for (const [status, response] of Object.entries(operation.responses)) {
        expect(response.description, `${method} ${path} ${status}`).toBeTruthy();
        expect(response.content?.["application/json"]?.schema, `${method} ${path} ${status} has no schema`).toBeDefined();
      }
    }
  });

  it("keeps the two modes the contract has, so no client is pointed at a third", () => {
    const mode = openApiSpec.components.schemas.Pact.properties!.mode;
    expect(mode.enum).toEqual(["exact-refund", "escrow"]);
    expect(JSON.stringify(openApiSpec)).not.toContain("upto");
  });

  it("resolves every $ref the document uses", () => {
    const refs = JSON.stringify(openApiSpec).match(/#\/components\/schemas\/[A-Za-z]+/g) ?? [];
    expect(refs.length).toBeGreaterThan(10);
    for (const ref of refs) {
      const name = ref.split("/").pop()!;
      expect(openApiSpec.components.schemas[name], `${ref} names no schema`).toBeDefined();
    }
  });

  it("uses no schema keyword the checker does not enforce, except the ones that only describe", () => {
    const allowed = new Set([...VALIDATED_KEYWORDS, ...DOCUMENT_KEYWORDS]);
    const unenforced = [...schemaKeywords(openApiSpec)].filter((keyword) => !allowed.has(keyword));
    expect(unenforced).toEqual([]);
  });
});

describe("#83 the pact routes answer as documented", () => {
  it("GET /api/pacts answers a page, with a cursor that is opaque but well-formed", async () => {
    query.mockResolvedValue({ rows: [pactRow(), pactRow({ pact_id: "22".repeat(32) })] });
    const body = (await answers("GET", "/api/pacts", 200, await listPactsRoute(at("/api/pacts?limit=1")))) as {
      items: PactRow[];
      nextCursor: string;
    };

    expect(body.items).toHaveLength(1);
    expect(body.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("GET /api/pacts answers 400 with the reason, and never reaches the database", async () => {
    const body = (await answers("GET", "/api/pacts", 400, await listPactsRoute(at("/api/pacts?state=nonsense")))) as {
      error: string;
    };

    expect(body.error).toContain("Invalid state");
    expect(query).not.toHaveBeenCalled();
  });

  it("GET /api/pacts answers 500 when the ledger cannot be read", async () => {
    query.mockRejectedValue(new Error("connection refused"));
    await answers("GET", "/api/pacts", 500, await listPactsRoute(at("/api/pacts")));
  });

  it("GET /api/pacts/{id} answers with the pact and its timeline", async () => {
    query.mockResolvedValueOnce({ rows: [pactRow()] }).mockResolvedValueOnce({ rows: [eventRow()] });
    const body = (await answers(
      "GET",
      "/api/pacts/{id}",
      200,
      await pactRoute(at(`/api/pacts/${PACT_ID}`), withId(PACT_ID))
    )) as { events: { id: string }[] };

    expect(body.events[0].id).toBe("7");
  });

  it("GET /api/pacts/{id} answers 400 for an id that is not 64 hex characters", async () => {
    await answers("GET", "/api/pacts/{id}", 400, await pactRoute(at("/api/pacts/abc"), withId("abc")));
    expect(query).not.toHaveBeenCalled();
  });

  it("GET /api/pacts/{id} answers 404 for a pact that is not indexed", async () => {
    query.mockResolvedValue({ rows: [] });
    await answers(
      "GET",
      "/api/pacts/{id}",
      404,
      await pactRoute(at(`/api/pacts/${PACT_ID}`), withId(PACT_ID))
    );
  });

  it("GET /api/pacts/{id} answers 500 when the database throws", async () => {
    query.mockRejectedValue(new Error("connection refused"));
    await answers(
      "GET",
      "/api/pacts/{id}",
      500,
      await pactRoute(at(`/api/pacts/${PACT_ID}`), withId(PACT_ID))
    );
  });
});

describe("#83 the certificate routes answer as documented", () => {
  it("GET /api/certificates/{id} answers an anchored certificate with what a verifier needs", async () => {
    query.mockResolvedValueOnce({ rows: [receiptRow()] }).mockResolvedValueOnce({ rows: [{ stage: "settled", tx_hash: "3".repeat(64) }] });
    vi.mocked(verifyCertificateOnChain).mockResolvedValue({ verified: true });

    const body = (await answers(
      "GET",
      "/api/certificates/{id}",
      200,
      await certificateRoute(at(`/api/certificates/${PACT_ID}`), withId(PACT_ID))
    )) as { status: string; batchId: number; proof: string[]; onChainVerified: boolean };

    expect(body.status).toBe("anchored");
    expect(body.batchId).toBe(1);
    expect(body.proof).toHaveLength(1);
    // `onChainVerified` is whatever the chain read answered; the certificate module makes that read itself,
    // and the unit suite has no Soroban RPC to ask, so the document only promises a boolean.
    expect(typeof body.onChainVerified).toBe("boolean");
  });

  it("GET /api/certificates/{id} answers a pending certificate without the anchored fields", async () => {
    query
      .mockResolvedValueOnce({ rows: [receiptRow({ batch_id: null, proof: null, root: null, anchor_tx: null, anchored_ledger: null })] })
      .mockResolvedValueOnce({ rows: [] });

    const body = (await answers(
      "GET",
      "/api/certificates/{id}",
      200,
      await certificateRoute(at(`/api/certificates/${PACT_ID}`), withId(PACT_ID))
    )) as { status: string; batchId?: number };

    expect(body.status).toBe("pending");
    expect(body.batchId).toBeUndefined();
  });

  it("GET /api/certificates/{id} answers 400 and 404 and 500", async () => {
    await answers("GET", "/api/certificates/{id}", 400, await certificateRoute(at("/api/certificates/x"), withId("x")));

    query.mockResolvedValueOnce({ rows: [] });
    await answers(
      "GET",
      "/api/certificates/{id}",
      404,
      await certificateRoute(at(`/api/certificates/${PACT_ID}`), withId(PACT_ID))
    );

    query.mockRejectedValueOnce(new Error("connection refused"));
    await answers(
      "GET",
      "/api/certificates/{id}",
      500,
      await certificateRoute(at(`/api/certificates/${PACT_ID}`), withId(PACT_ID))
    );
  });

  it("POST /api/certificates/verify answers what the contract said, including a false proof", async () => {
    vi.mocked(verifyCertificateOnChain).mockResolvedValue({ verified: false, error: "anchor is not deployed" });

    const res = await verifyRoute(
      new Request("http://localhost/api/certificates/verify", {
        method: "POST",
        body: JSON.stringify({ batchId: 1, leaf: "c".repeat(64), proof: ["d".repeat(64)] }),
      })
    );
    const body = (await answers("POST", "/api/certificates/verify", 200, res)) as { verified: boolean };
    expect(body.verified).toBe(false);
  });

  it("POST /api/certificates/verify answers 400 for a body it cannot read and 500 for a request that is not json", async () => {
    const bad = new Request("http://localhost/api/certificates/verify", { method: "POST", body: JSON.stringify({ leaf: "c".repeat(64) }) });
    const refusal = (await answers("POST", "/api/certificates/verify", 400, await verifyRoute(bad))) as { error: string };
    expect(refusal.error).toContain("batchId");

    const notJson = new Request("http://localhost/api/certificates/verify", { method: "POST", body: "{" });
    await answers("POST", "/api/certificates/verify", 500, await verifyRoute(notJson));
  });
});

describe("#83 the ops routes answer as documented", () => {
  it("GET /api/ops/health answers 200 with every probe it measured", async () => {
    vi.mocked(measureOpsHealth).mockResolvedValue({ metrics: healthyMetrics, unmeasured: [] } as never);
    const body = (await answers("GET", "/api/ops/health", 200, await healthRoute())) as { healthy: boolean; probes: unknown[] };

    expect(body.healthy).toBe(true);
    expect(body.probes.length).toBeGreaterThan(0);
  });

  it("GET /api/ops/health answers 503 when a signal fails, and still reports the readings", async () => {
    vi.mocked(measureOpsHealth).mockResolvedValue({ metrics: { ...healthyMetrics, sponsorBalanceXlm: 0.01 }, unmeasured: [] } as never);
    const body = (await answers("GET", "/api/ops/health", 503, await healthRoute())) as { healthy: boolean; alerts: string[]; metrics: unknown };

    expect(body.healthy).toBe(false);
    expect(body.alerts.length).toBeGreaterThan(0);
  });

  it("GET /api/ops/health answers 503 for a source it could not read at all, not a green report", async () => {
    vi.mocked(measureOpsHealth).mockRejectedValue(new Error("no RPC configured"));
    const body = (await answers("GET", "/api/ops/health", 503, await healthRoute())) as { probes: unknown[] };

    expect(body.probes).toEqual([]);
  });

  it("GET /api/ops/liveness answers 200 without touching anything", async () => {
    await answers("GET", "/api/ops/liveness", 200, await livenessRoute());
    expect(query).not.toHaveBeenCalled();
  });
});

describe("#83 the internal cron routes answer as documented", () => {
  it("GET /api/sync answers the pass", async () => {
    vi.mocked(sync).mockResolvedValue(syncReport() as never);
    await answers("GET", "/api/sync", 200, await syncRoute(authorized()));
  });

  it("GET /api/sync answers 401 for the wrong secret and 503 when no secret is configured", async () => {
    await answers("GET", "/api/sync", 401, await syncRoute(at("/api/sync")));

    delete process.env.CRON_SECRET;
    const refusal = (await answers("GET", "/api/sync", 503, await syncRoute(authorized()))) as { error: string };
    expect(refusal.error).toContain("CRON_SECRET");
  });

  it("GET /api/sync answers 503 outside retention and 500 for a read that merely failed", async () => {
    vi.mocked(sync).mockRejectedValue(new SyncFailuresError([failure("outsideRetention")], syncReport() as never));
    await answers("GET", "/api/sync", 503, await syncRoute(authorized()));

    vi.mocked(sync).mockRejectedValue(new SyncFailuresError([failure("readFailed")], syncReport() as never));
    await answers("GET", "/api/sync", 500, await syncRoute(authorized()));

    vi.mocked(sync).mockRejectedValue(new Error("RPC is down"));
    await answers("GET", "/api/sync", 500, await syncRoute(authorized()));
  });

  it("GET /api/anchor answers the batch, or null when there is nothing to anchor", async () => {
    vi.mocked(anchor).mockResolvedValue({ batchId: 1, root: "e".repeat(64), leaves: 2, anchorTx: "2".repeat(64), anchoredLedger: 601 } as never);
    await answers("GET", "/api/anchor", 200, await anchorRoute(authorized()));

    vi.mocked(anchor).mockResolvedValue(null);
    const body = (await answers("GET", "/api/anchor", 200, await anchorRoute(authorized()))) as { result: unknown };
    expect(body.result).toBeNull();
  });

  it("GET /api/anchor answers 401, 503 without a secret, and 500 when the cycle throws", async () => {
    await answers("GET", "/api/anchor", 401, await anchorRoute(at("/api/anchor")));

    delete process.env.CRON_SECRET;
    await answers("GET", "/api/anchor", 503, await anchorRoute(authorized()));

    process.env.CRON_SECRET = SECRET;
    vi.mocked(anchor).mockRejectedValue(new Error("signer has no funds"));
    await answers("GET", "/api/anchor", 500, await anchorRoute(authorized()));
  });

  it("GET /api/backfill answers the ranges it closed", async () => {
    process.env.HISTORY_RPC_URL = "https://history.example";
    vi.mocked(syncWithHistory).mockResolvedValue({ backfillResults: [syncResult("pact")], syncResults: [syncResult("pact")] } as never);
    await answers("GET", "/api/backfill", 200, await backfillRoute(authorized()));
  });

  it("GET /api/backfill answers 401 and 503 for each thing that can be missing", async () => {
    await answers("GET", "/api/backfill", 401, await backfillRoute(at("/api/backfill")));

    const noSource = (await answers("GET", "/api/backfill", 503, await backfillRoute(authorized()))) as { error: string; hint: string };
    expect(noSource.error).toBe("noHistorySource");
    expect(noSource.hint).toContain("HISTORY_RPC_URL");

    process.env.HISTORY_RPC_URL = "https://history.example";
    vi.mocked(syncWithHistory).mockRejectedValue(new SyncFailuresError([failure("outsideRetention")], syncReport() as never));
    await answers("GET", "/api/backfill", 503, await backfillRoute(authorized()));
  });

  it("GET /api/backfill answers 500 with the history source's own reason", async () => {
    process.env.HISTORY_RPC_URL = "https://history.example";
    vi.mocked(syncWithHistory).mockRejectedValue(new Error("range not kept"));
    const body = (await answers("GET", "/api/backfill", 500, await backfillRoute(authorized()))) as { reason: string };

    expect(body.reason).toBe("range not kept");
  });
});

describe("#83 the published document is this spec", () => {
  const emitted = toYaml(openApiSpec);

  it("is checked in, and equals the emission of the spec object", () => {
    if (process.env.WRITE_OPENAPI === "1") {
      writeFileSync(SPEC_FILE, emitted);
      return;
    }
    const checkedIn = readFileSync(SPEC_FILE, "utf8");
    expect(checkedIn, "docs/openapi.yaml is stale — run WRITE_OPENAPI=1 pnpm test").toBe(emitted);
  });

  it("reads back as the object it was emitted from", () => {
    const checkedIn = process.env.WRITE_OPENAPI === "1" ? emitted : readFileSync(SPEC_FILE, "utf8");

    expect(fromYaml(checkedIn)).toEqual(JSON.parse(JSON.stringify(openApiSpec)));
  });

  it("is a document, not a directory listing: it has the routes and the schemas it claims", () => {
    const checkedIn = readFileSync(SPEC_FILE, "utf8");

    expect(checkedIn).toContain("openapi: 3.1.0");
    expect(checkedIn).toContain('"/api/pacts/{id}":');
    expect(checkedIn).toContain("x-internal: true");
    expect(checkedIn.split("\n").length).toBeGreaterThan(300);
  });

  it("links from the README, so a caller finds it without reading the code", () => {
    expect(readFileSync(README_FILE, "utf8")).toContain("docs/openapi.yaml");
  });

  it("the reader understands what the emitter can write, including the awkward strings", () => {
    const tricky = {
      ok: true,
      nothing: null,
      count: 0,
      words: ["true", "null", "1", "on", "yes", ""],
      "weird: key": "a value: with a colon, # and a 'quote'",
      nested: [{ a: 1 }, { b: ["x", "y"] }],
      prose:
        "Page through the indexed ledger, newest first, because a caller that wants what is on chain right now must not pay one request per pact it has not seen yet.",
      empty: {},
      empty_list: [],
    };

    expect(fromYaml(toYaml(tricky))).toEqual(JSON.parse(JSON.stringify(tricky)));
  });
});

describe("#83 every documented status has been produced by a real handler", () => {
  it("covers the whole document", () => {
    expect([...new Set(answered)].sort()).toEqual(documentedStatuses());
  });
});

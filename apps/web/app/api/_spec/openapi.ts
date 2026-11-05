/**
 * The machine-readable contract for every route Studio serves. #83.
 *
 * This object, not the YAML beside it, is what the tests read: `test/unit/openapi.test.ts` calls each real
 * handler and validates its response against the schema declared here, and it fails if the checked-in
 * `docs/openapi.yaml` is not the emission of this object. So the published document cannot drift into
 * describing an API the code does not have — a hand-written YAML next to hand-written expectations would
 * let both be wrong in different directions.
 *
 * Every field here comes from reading the handler and the row types it returns, not from the README's
 * table: amounts are the decimal strings `pg` hands back for `numeric(30,7)` (hard rule: stroops on-chain,
 * decimal strings in TypeScript), and a `Date` becomes an ISO string when `Response.json` serialises it.
 */

/** The JSON Schema subset this file uses — OpenAPI 3.1 schemas are JSON Schema 2020-12. */
export interface Schema {
  type?: string | string[];
  description?: string;
  format?: string;
  pattern?: string;
  enum?: readonly (string | number | boolean | null)[];
  minimum?: number;
  maximum?: number;
  default?: unknown;
  properties?: Record<string, Schema>;
  required?: readonly string[];
  additionalProperties?: boolean | Schema;
  items?: Schema;
  anyOf?: Schema[];
  $ref?: string;
}

type Parameter = {
  name: string;
  in: "path" | "query";
  required?: boolean;
  description?: string;
  schema: Schema;
};

/** `x-internal` is our own marker: a route only `studio-cron` or an operator calls, behind `CRON_SECRET`. */
type Operation = {
  operationId: string;
  tags: readonly string[];
  summary: string;
  description?: string;
  "x-internal"?: boolean;
  parameters?: Parameter[];
  requestBody?: { required: boolean; content: { "application/json": { schema: Schema } } };
  responses: Record<string, { description: string; content?: { "application/json": { schema: Schema } } }>;
};

const PACT_ID = "^[0-9a-fA-F]{64}$";
const ADDRESS = "^G[A-Z2-7]{55}$";
const DECIMAL = "^-?[0-9]+(\\.[0-9]+)?$";
const CURSOR = "^[A-Za-z0-9_-]+$";

const json = (schema: Schema) => ({ "application/json": { schema } });
const error = { description: "The reason, in a sentence a caller can show the user.", content: json({ $ref: "#/components/schemas/Error" }) };

const pact = {
  type: "object",
  description: "One row of `pacts` (migrations/001_core.sql). Amounts are decimal strings; deadlines are ledger numbers.",
  required: [
    "pact_id", "mode", "buyer", "seller", "resource_url", "cap", "condition_hash", "condition",
    "metered", "silence", "state", "verdict_deadline", "settle_deadline", "to_seller", "to_buyer",
    "created_at", "updated_at",
  ],
  properties: {
    pact_id: { type: "string", pattern: PACT_ID },
    mode: { type: "string", enum: ["exact-refund", "escrow"], description: "M0 and M2 only — there is no third mode." },
    buyer: { type: "string", pattern: ADDRESS },
    seller: { type: "string", pattern: ADDRESS },
    resource_url: { type: "string" },
    cap: { type: "string", pattern: DECIMAL, description: "numeric(30,7): the most that can leave escrow." },
    condition_hash: { type: "string", pattern: PACT_ID },
    condition: { type: "object", additionalProperties: true, description: "The condition the verifier checks, as stored." },
    metered: { type: "boolean" },
    silence: { type: ["string", "null"], enum: ["refund", "pay", null], description: "What the deadline settles on if the verifier says nothing." },
    state: { type: "string", enum: ["funded", "paid", "allowed", "denied", "settled", "released", "refunded"] },
    verdict_deadline: { type: ["integer", "null"] },
    settle_deadline: { type: ["integer", "null"] },
    to_seller: { type: "string", pattern: DECIMAL },
    to_buyer: { type: "string", pattern: DECIMAL },
    created_at: { type: "string", format: "date-time", description: "When the pact was opened; the keyset cursor pages on this." },
    updated_at: { type: "string", format: "date-time" },
  },
} satisfies Schema;

const pactEvent = {
  type: "object",
  description: "One indexed chain event, oldest first.",
  required: ["id", "pact_id", "stage", "tx_hash", "ledger", "data"],
  properties: {
    id: {
      type: "string",
      pattern: "^[0-9]+$",
      description:
        "`pact_events.id` is a `bigserial`, and `pg` returns 8-byte integers as decimal strings so a value above `Number.MAX_SAFE_INTEGER` cannot lose digits. Sort on it: it is the index order the timeline is written in.",
    },
    pact_id: { type: "string", pattern: PACT_ID },
    stage: { type: "string", enum: ["opened", "paid", "verdict", "settled", "meter_closed", "released", "refunded"] },
    tx_hash: { type: ["string", "null"] },
    ledger: { type: ["integer", "null"] },
    data: { type: "object", additionalProperties: true, description: "The event's own fields: `cap`, `verdict`, `amount`, `to_seller`, `to_buyer` as stroop strings." },
  },
} satisfies Schema;

const sourceFailure = {
  type: "object",
  description: "One source this pass could not read. Its cursor did not move, so nothing it had not read was marked as read.",
  required: ["source", "reason", "cursor", "oldestLedger", "message"],
  properties: {
    source: { type: "string", description: "`pact`, or `refund_vault:<contract>`." },
    reason: { type: "string", enum: ["outsideRetention", "readFailed"], description: "`outsideRetention` will not fix itself: it needs /api/backfill with a history source." },
    cursor: { type: "integer", description: "The ledger this source's pass stopped at." },
    oldestLedger: { type: "integer", description: "The oldest ledger the RPC still keeps." },
    message: { type: "string" },
  },
} satisfies Schema;

const syncResult = {
  type: "object",
  required: ["source", "fromLedger", "toLedger", "indexed", "deferred"],
  properties: {
    source: { type: "string" },
    fromLedger: { type: "integer" },
    toLedger: { type: "integer" },
    indexed: { type: "integer" },
    deferred: { type: "integer", description: "Events whose pact row does not exist yet; held in `deferred_events` and replayed by later passes." },
  },
} satisfies Schema;

const syncReport = {
  type: "object",
  description: "One indexing pass over every source.",
  required: ["sources", "failures", "replayed", "deferred"],
  properties: {
    sources: { type: "array", items: syncResult },
    failures: { type: "array", items: sourceFailure, description: "Empty when every source could be read." },
    replayed: { type: "integer", description: "Deferred events this pass's replay wrote." },
    deferred: { type: "integer", description: "Deferred events still waiting after the replay." },
  },
} satisfies Schema;

const anchorResult = {
  type: "object",
  description: "A batch that was written to the chain. `null` from the route means there was nothing to anchor.",
  required: ["batchId", "root", "leaves", "anchorTx", "anchoredLedger"],
  properties: {
    batchId: { type: "integer" },
    root: { type: "string", description: "The Merkle root of the batch, as anchored." },
    leaves: { type: "integer" },
    anchorTx: { type: "string" },
    anchoredLedger: { type: "integer" },
  },
} satisfies Schema;

const probe = {
  type: "object",
  description: "One signal, measured from its own source. A signal whose source could not be read reports failing with no value — never a silent pass, never an invented 0.",
  required: ["name", "ok"],
  properties: {
    name: { type: "string", description: "`sponsor_balance`, `indexer_lag`, `pending_certificates`, `verifier_error_rate`, `anchor_verification` — or a name a newer probe added." },
    ok: { type: "boolean" },
    value: { type: "number", description: "Absent when the signal could not be measured." },
    threshold: { type: "number" },
    configSource: { type: "string", description: "Where the threshold came from: the default, or the variable that overrode it." },
    alert: { type: "string" },
    unhealthySince: { type: "string", description: "ISO timestamp of the first failing run this streak began with." },
    alertCount: { type: "integer", description: "How many times this state has been alerted." },
  },
} satisfies Schema;

const metrics = {
  type: "object",
  description: "The readings the probes were computed from, so an alert can be checked without re-measuring.",
  properties: {
    sponsorBalanceXlm: { type: "number" },
    indexerLagLedgers: { type: "number" },
    rpcRetentionLedgers: { type: "number" },
    indexerLagSeconds: { type: "number" },
    pendingCertificatesCount: { type: "number" },
    verifierTotalRequests: { type: "number" },
    verifierErrorRequests: { type: "number" },
  },
} satisfies Schema;

const certificate = {
  type: "object",
  description: "A receipt certificate: `pending` until its batch is anchored, then `anchored` with the proof and the batch id to verify on-chain.",
  required: ["pactId", "transition", "toSeller", "toBuyer", "leaf", "leafInput", "status", "receiptAnchor", "txs"],
  properties: {
    pactId: { type: "string", pattern: PACT_ID },
    transition: { type: "string", enum: ["paid", "settled", "released", "refunded"] },
    toSeller: { type: "string", pattern: DECIMAL },
    toBuyer: { type: "string", pattern: DECIMAL },
    envelopeHash: { type: "string", pattern: PACT_ID },
    leaf: { type: "string", pattern: PACT_ID, description: "The Merkle leaf: hash of `leafInput`." },
    leafInput: {
      type: "object",
      description: "The leaf's exact inputs, so anyone can recompute `leaf`. Amounts here are stroops, not decimal strings.",
      required: ["transition", "toSellerStroops", "toBuyerStroops", "envelopeHash", "ledger"],
      properties: {
        transition: { type: "string" },
        toSellerStroops: { type: "string", pattern: DECIMAL },
        toBuyerStroops: { type: "string", pattern: DECIMAL },
        envelopeHash: { type: ["string", "null"] },
        ledger: { type: ["integer", "null"] },
      },
    },
    status: { type: "string", enum: ["pending", "anchored"] },
    proof: { type: "array", items: { type: "string" }, description: "Only when anchored." },
    batchId: { type: "integer", description: "The ReceiptAnchor batch id: pass it with `leaf` and `proof` to `verify_receipt`. Only when anchored." },
    root: { type: "string", description: "The anchored Merkle root this proof runs against. Only when anchored." },
    receiptAnchor: { type: "string", description: "The contract id the proof is verified against (`RECEIPT_ANCHOR_ID`)." },
    anchorTx: { type: "string" },
    anchoredLedger: { type: "integer" },
    onChainVerified: { type: "boolean", description: "Present when the certificate was anchored: what `verify_receipt` answered when this response was built." },
    txs: { type: "array", items: { type: "object", required: ["stage", "hash"], properties: { stage: { type: "string" }, hash: { type: "string" } } } },
  },
} satisfies Schema;

/** Every shape more than one response uses. A route answers with these; the document names them once. */
const schemas: Record<string, Schema> = {
  Error: {
    type: "object",
    description: "A refusal. The reason names the parameter or the missing row, because a bare status makes a program guess.",
    required: ["error"],
    properties: { error: { type: "string" } },
  },
  Pact: pact,
  PactEvent: pactEvent,
  PactDetails: {
    type: "object",
    description: "A pact and its timeline.",
    required: ["pact", "events"],
    properties: { pact: pact, events: { type: "array", items: pactEvent } },
  },
  PactPage: {
    type: "object",
    description: "One page of the ledger, newest first, plus the cursor that addresses the page after it.",
    required: ["items", "nextCursor"],
    properties: {
      items: { type: "array", items: pact, description: "`limit` rows, or fewer on the last page." },
      nextCursor: { type: ["string", "null"], pattern: CURSOR, description: "Opaque keyset on `(created_at, pact_id) DESC`. Null when this is the oldest page — there is no page number to ask for, because a forward-only cursor cannot offer one." },
    },
  },
  Certificate: certificate,
  VerifyRequest: {
    type: "object",
    description: "The three things `verify_receipt` takes. `leaf` and each proof element are hex without a prefix.",
    required: ["batchId", "leaf", "proof"],
    properties: {
      batchId: { type: "integer" },
      leaf: { type: "string", pattern: PACT_ID },
      proof: { type: "array", items: { type: "string" } },
      receiptAnchorId: { type: "string", description: "Override the anchored contract; defaults to `RECEIPT_ANCHOR_ID`." },
    },
  },
  VerifyResult: {
    type: "object",
    description: "What the chain said. `verified: false` with an `error` means the read failed, not that the proof was wrong — the contract answers false rather than throwing.",
    required: ["verified"],
    properties: {
      verified: { type: "boolean" },
      error: { type: "string" },
    },
  },
  HealthReport: {
    type: "object",
    description: "Every signal, whether it passed, and what it read. `healthy: false` comes with 503 so a monitor does not have to parse the array.",
    required: ["healthy", "probes", "alerts"],
    properties: {
      healthy: { type: "boolean" },
      probes: { type: "array", items: probe },
      alerts: { type: "array", items: { type: "string" } },
      metrics: metrics,
    },
  },
  Liveness: {
    type: "object",
    description: "The process is up. Says nothing about whether its sources can be read — that is /api/ops/health.",
    required: ["status", "uptime"],
    properties: { status: { type: "string", enum: ["ok"] }, uptime: { type: "number", description: "Seconds, from `process.uptime()`." } },
  },
  SyncReport: syncReport,
  SourceFailure: sourceFailure,
  AnchorResult: anchorResult,
  BackfillReport: {
    type: "object",
    description: "Ranges read from the history source, then the normal pass that resumed from them.",
    required: ["backfillResults", "syncResults"],
    properties: {
      backfillResults: { type: "array", items: syncResult },
      syncResults: { type: "array", items: syncResult },
    },
  },
  SyncRun: {
    type: "object",
    description: "A `/api/sync` pass that ran. Every source is reported, including the ones that failed, so a partial pass is not a silent one.",
    required: ["ok", "result"],
    properties: { ok: { type: "boolean", enum: [true] }, result: syncReport },
  },
  AnchorRun: {
    type: "object",
    description: "A cron route that did its job. `result` is null when there was nothing to do.",
    required: ["ok", "result"],
    properties: { ok: { type: "boolean", enum: [true] }, result: { anyOf: [anchorResult, { type: "null" }] } },
  },
  BackfillRun: {
    type: "object",
    description: "A `/api/backfill` that closed the gaps it could, then resumed the normal pass.",
    required: ["ok", "result"],
    properties: { ok: { type: "boolean", enum: [true] }, result: { $ref: "#/components/schemas/BackfillReport" } },
  },
  CronRefusal: {
    type: "object",
    description:
      "An operator route that did not complete. `error` names the state to change: `CRON_SECRET is not configured` means nothing ran, `outsideRetention` means a source's cursor is older than the RPC keeps events for and only a backfill can move it, `noHistorySource` means backfill has nothing to read the gap from. Whatever could be read still is, and `result` reports it.",
    required: ["error"],
    properties: {
      error: { type: "string" },
      hint: { type: "string", description: "What to set, when a configuration change is the fix." },
      reason: { type: "string", description: "The history source's own refusal, from `/api/backfill`." },
      outsideRetention: { type: "array", items: sourceFailure },
      failedSources: { type: "array", items: sourceFailure },
      result: syncReport,
    },
  },
};

const pactIdParameter: Parameter = {
  name: "id",
  in: "path",
  required: true,
  description: "64 hexadecimal characters: a pact id, or a certificate's leaf.",
  schema: { type: "string", pattern: PACT_ID },
};

const paths: Record<string, Record<string, Operation>> = {
  "/api/pacts": {
    get: {
      operationId: "listPacts",
      tags: ["Pacts"],
      summary: "Page through the indexed ledger, newest first",
      description:
        "The collection the dashboards and agents need: `GET /api/pacts/{id}` answers one pact, and without this a caller that wants 'what is on chain' pays N requests for N pacts. Paging is a keyset on `(created_at, pact_id) DESC` rather than an offset, because the indexer is still appending rows above the page a caller is reading, so an offset repeats or drops a pact.",
      parameters: [
        { name: "state", in: "query", description: "Only pacts in this state. An empty value means no filter.", schema: { type: "string", enum: ["funded", "paid", "allowed", "denied", "settled", "released", "refunded"] } },
        { name: "seller", in: "query", description: "Only pacts sold by this Stellar account.", schema: { type: "string", pattern: ADDRESS } },
        { name: "limit", in: "query", description: "Rows per page, 1 to 100.", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
        { name: "cursor", in: "query", description: "A `nextCursor` from the previous page, passed unchanged.", schema: { type: "string", pattern: CURSOR } },
      ],
      responses: {
        "200": { description: "One page.", content: json({ $ref: "#/components/schemas/PactPage" }) },
        "400": { description: "A parameter was refused, and the reason names it. A cursor that does not decode is a 400 rather than an empty page, because an empty list would read as 'the chain has no more pacts' and stop a paging loop early.", content: json({ $ref: "#/components/schemas/Error" }) },
        "500": error,
      },
    },
  },
  "/api/pacts/{id}": {
    get: {
      operationId: "getPact",
      tags: ["Pacts"],
      summary: "One pact and its event timeline",
      responses: {
        "200": { description: "The pact and every event indexed for it, oldest first.", content: json({ $ref: "#/components/schemas/PactDetails" }) },
        "400": { description: "The id is not 64 hexadecimal characters.", content: json({ $ref: "#/components/schemas/Error" }) },
        "404": { description: "No pact with that id has been indexed. It may exist on chain and not be indexed yet — `GET /api/sync` reads the chain on demand.", content: json({ $ref: "#/components/schemas/Error" }) },
        "500": error,
      },
      parameters: [pactIdParameter],
    },
  },
  "/api/certificates/{id}": {
    get: {
      operationId: "getCertificate",
      tags: ["Certificates"],
      summary: "One receipt certificate, pending or anchored",
      description: "`id` is the pact id or the leaf itself. An anchored certificate carries the batch id and proof to re-run `verify_receipt` with, and `onChainVerified` from the read this response made.",
      parameters: [pactIdParameter],
      responses: {
        "200": { description: "The certificate.", content: json({ $ref: "#/components/schemas/Certificate" }) },
        "400": { description: "The id is not 64 hexadecimal characters.", content: json({ $ref: "#/components/schemas/Error" }) },
        "404": { description: "No receipt for that pact or leaf.", content: json({ $ref: "#/components/schemas/Error" }) },
        "500": error,
      },
    },
  },
  "/api/certificates/verify": {
    post: {
      operationId: "verifyCertificate",
      tags: ["Certificates"],
      summary: "Check a proof against ReceiptAnchor on the chain",
      description: "The same call the viewer makes in the browser, for a caller that wants the contract's own answer. A false result is a 200: the contract says the proof does not verify. A 500 means the request itself could not be read.",
      requestBody: { required: true, content: json({ $ref: "#/components/schemas/VerifyRequest" }) },
      responses: {
        "200": { description: "What the contract answered.", content: json({ $ref: "#/components/schemas/VerifyResult" }) },
        "400": { description: "`batchId`, `leaf` or `proof` was missing or the wrong shape.", content: json({ $ref: "#/components/schemas/Error" }) },
        "500": error,
      },
    },
  },
  "/api/ops/health": {
    get: {
      operationId: "getHealth",
      tags: ["Ops"],
      summary: "Every monitoring signal, each measured from its own source",
      description: "Sponsor balance from the ledger entry, indexer lag and backlog from the RPC and the database, verifier error rate from the verifier's own counters. A signal whose source cannot be read is a failing probe with no value, so an outage is visible rather than green.",
      responses: {
        "200": { description: "All probes passed.", content: json({ $ref: "#/components/schemas/HealthReport" }) },
        "503": { description: "At least one probe failed, or health could not be measured at all (a deployment with no RPC or database configured).", content: json({ $ref: "#/components/schemas/HealthReport" }) },
      },
    },
  },
  "/api/ops/liveness": {
    get: {
      operationId: "getLiveness",
      tags: ["Ops"],
      summary: "The process is up",
      description: "Answers without touching the database or the chain, so a probe failure here means the app is not running rather than a source is unreachable.",
      responses: {
        "200": { description: "Running.", content: json({ $ref: "#/components/schemas/Liveness" }) },
      },
    },
  },
  "/api/sync": {
    get: {
      operationId: "runSync",
      tags: ["Internal"],
      summary: "One indexing pass over every source",
      "x-internal": true,
      description: "Internal: `studio-cron` calls this every few minutes with the `CRON_SECRET` bearer token. Not part of the public API; it writes rows and moves cursors.",
      responses: {
        "200": { description: "The pass, source by source.", content: json({ $ref: "#/components/schemas/SyncRun" }) },
        "401": { description: "The bearer token or `x-cron-secret` header did not match `CRON_SECRET`.", content: json({ $ref: "#/components/schemas/Error" }) },
        "503": { description: "Either no `CRON_SECRET` is configured, or a source's cursor is older than the RPC's retention. In the second case the other sources were still indexed and that cursor did not move; it will not fix itself, it needs `/api/backfill`.", content: json({ $ref: "#/components/schemas/CronRefusal" }) },
        "500": { description: "A source could not be read for another reason, or the pass could not run at all.", content: json({ $ref: "#/components/schemas/CronRefusal" }) },
      },
    },
  },
  "/api/anchor": {
    get: {
      operationId: "runAnchor",
      tags: ["Internal"],
      summary: "One anchoring cycle",
      "x-internal": true,
      description: "Internal: scheduled hourly by `studio-cron` with the `CRON_SECRET` bearer token. Batches pending receipts into the chain, so it signs transactions that cost money, and fails closed when `CRON_SECRET` is unset.",
      responses: {
        "200": { description: "The batch anchored, or `result: null` when there was nothing to anchor.", content: json({ $ref: "#/components/schemas/AnchorRun" }) },
        "401": { description: "Wrong secret.", content: json({ $ref: "#/components/schemas/Error" }) },
        "503": { description: "`CRON_SECRET` is not configured, so the route will not run.", content: json({ $ref: "#/components/schemas/Error" }) },
        "500": error,
      },
    },
  },
  "/api/backfill": {
    get: {
      operationId: "runBackfill",
      tags: ["Internal"],
      summary: "Close an indexing gap from a history source, then resume the pass",
      "x-internal": true,
      description: "Internal: the recovery path for a 503 from `/api/sync`. Needs `HISTORY_RPC_URL` (an archival RPC) or `HISTORY_SOURCE_URL`, and the same `CRON_SECRET` as `/api/sync`.",
      responses: {
        "200": { description: "The ranges read from history, then the pass that resumed from them.", content: json({ $ref: "#/components/schemas/BackfillRun" }) },
        "401": { description: "Wrong secret.", content: json({ $ref: "#/components/schemas/Error" }) },
        "503": { description: "No `CRON_SECRET`, no history source configured (`noHistorySource`, and no retry of this route will change that), or a source that still cannot be read after the backfill (`outsideRetention`).", content: json({ $ref: "#/components/schemas/CronRefusal" }) },
        "500": { description: "The backfill could not run; `reason` is the history source's own refusal.", content: json({ $ref: "#/components/schemas/CronRefusal" }) },
      },
    },
  },
};

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Pactwright Studio HTTP API",
    version: "1.0.0",
    description:
      "The public record of purchases made by AI agents on Stellar, as Studio indexes it. Reads answer from the database the indexer writes, never from the chain directly — except `POST /api/certificates/verify`, which asks the ReceiptAnchor contract. Routes marked internal are Studio's own operations endpoints behind `CRON_SECRET` and are not part of this contract.",
    license: { name: "MIT", url: "https://github.com/Pactwright/Pactwright-studio/blob/main/LICENSE" },
  },
  servers: [
    { url: "https://pactwright-studio.vercel.app", description: "Testnet deployment." },
    { url: "http://localhost:3000", description: "Local development." },
  ],
  tags: [
    { name: "Pacts", description: "What was bought, and where the money went." },
    { name: "Certificates", description: "Receipts and their on-chain proofs." },
    { name: "Ops", description: "Monitoring probes." },
    { name: "Internal", description: "Cron and operator routes behind `CRON_SECRET`. Documented so the shapes are not folklore; not a public contract." },
  ],
  paths,
  components: { schemas },
} as const;

/** Look up a documented operation by the route file it belongs to, e.g. `app/api/pacts/[id]/route.ts`. */
export function operationFor(method: string, path: string): Operation | undefined {
  return paths[path]?.[method.toLowerCase()];
}

/** The declared response schema for a status, or the one for `default`. */
export function responseSchema(method: string, path: string, status: number): Schema | undefined {
  const operation = operationFor(method, path);
  if (!operation) return undefined;
  const response = operation.responses[String(status)] ?? operation.responses.default;
  return response?.content?.["application/json"]?.schema;
}

/** Every documented path, and the methods documented for it. */
export function documentedOperations(): { path: string; method: string; operation: Operation }[] {
  return Object.entries(paths).flatMap(([path, byMethod]) =>
    Object.entries(byMethod).map(([method, operation]) => ({ path, method: method.toUpperCase(), operation }))
  );
}

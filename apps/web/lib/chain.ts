/**
 * Stellar access for the indexer and anchorer: configuration, `getEvents` pages, and one
 * signed contract call. ROADMAP S-02, S-04.
 */
import {
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";

export interface ChainConfig {
  rpcUrl: string;
  networkPassphrase: string;
  pactContractId: string;
  receiptAnchorId: string;
  /** RefundVaults whose refunds are indexed (M0 and disputes). */
  refundVaultIds: string[];
  /** Ledger to start from when a source has no cursor yet. */
  startLedger?: number;
}

/** Reads the chain configuration; throws listing every missing variable. */
export function chainConfig(env: NodeJS.ProcessEnv = process.env): ChainConfig {
  const missing = ["STELLAR_RPC_URL", "STELLAR_NETWORK", "PACT_CONTRACT_ID", "RECEIPT_ANCHOR_ID"].filter((k) => !env[k]?.trim());
  if (missing.length) throw new Error(`chain configuration incomplete: ${missing.join(", ")} not set`);
  const network = env.STELLAR_NETWORK!.trim();
  if (network !== "testnet" && network !== "pubnet") throw new Error(`STELLAR_NETWORK must be testnet or pubnet`);
  const expected = network === "pubnet" ? Networks.PUBLIC : Networks.TESTNET;
  const passphrase = env.STELLAR_NETWORK_PASSPHRASE?.trim() || expected;
  if (passphrase !== expected) throw new Error("STELLAR_NETWORK_PASSPHRASE does not match STELLAR_NETWORK");
  const start = env.INDEX_START_LEDGER?.trim();
  return {
    rpcUrl: env.STELLAR_RPC_URL!.trim(),
    networkPassphrase: passphrase,
    pactContractId: env.PACT_CONTRACT_ID!.trim(),
    receiptAnchorId: env.RECEIPT_ANCHOR_ID!.trim(),
    refundVaultIds: (env.REFUND_VAULT_IDS ?? "").split(",").map((v) => v.trim()).filter(Boolean),
    ...(start ? { startLedger: Number(start) } : {}),
  };
}

export function server(config: Pick<ChainConfig, "rpcUrl">): rpc.Server {
  return new rpc.Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith("http://") });
}

/** A contract event with topics and value already converted to JS values. */
export interface RawEvent {
  contractId: string;
  ledger: number;
  txHash: string;
  /** Unique, ordered event id from RPC. */
  id: string;
  topics: unknown[];
  value: unknown;
}

export interface EventPage {
  events: RawEvent[];
  /** Highest ledger the RPC has seen; the range was scanned up to here. */
  latestLedger: number;
  oldestLedger: number;
  /**
   * The ledger this read actually covers. Equal to `latestLedger` when the range was read to the end,
   * and to the last event's ledger when the page budget stopped it early — so a caller can move its
   * cursor to here and never mark events unread as read.
   */
  throughLedger: number;
}

/**
 * What one `getEvents` round trip gives back, as the SDK shapes it. `topic`/`value` stay as ScVals
 * because the caller decodes them; the ledger and event id are what paging turns on.
 */
export interface RpcEventPage {
  events: { id: string; ledger: number; txHash: string; contractId: string; topic: xdr.ScVal[]; value: xdr.ScVal }[];
  latestLedger: number;
  oldestLedger: number;
  /** Where the next page starts. This RPC returns one even when the range is exhausted. */
  cursor?: string;
}

/**
 * Reads every event of one contract from `startLedger` to the RPC's tip, following the cursor.
 *
 * Why the page size cannot end this loop, measured on `soroban-testnet.stellar.org` on 2026-10-31: one
 * request for `limit: 200` over a busy window came back with exactly 100 events and another with exactly
 * 200, from the same contract. How many events a page carries is the RPC's choice, so `events.length
 * < limit` is true in the *middle* of a range — and that was the old stopping rule. The same window
 * held 408 events, delivered as pages of 100, 100, 100, 100, 8, 0: an empty page is the only answer
 * that means the range is finished.
 */
export async function paginateContractEvents(
  fetchPage: (cursor?: string) => Promise<RpcEventPage>,
  startLedger: number,
  maxPages = MAX_PAGES_PER_READ,
): Promise<EventPage> {
  const events: RawEvent[] = [];
  const seen = new Set<string>();
  let latestLedger = 0;
  let oldestLedger = 0;
  let lastLedger = 0;
  let cursor: string | undefined;
  for (let pages = 0; ; pages++) {
    if (pages >= maxPages) {
      // Out of budget with more range left: report only what was read, so the caller's cursor stops
      // here and the next pass continues instead of the range being marked as done.
      return { events, latestLedger, oldestLedger, throughLedger: Math.max(startLedger - 1, lastLedger) };
    }
    const page = await fetchPage(cursor);
    latestLedger = page.latestLedger;
    oldestLedger = page.oldestLedger;
    for (const e of page.events) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      lastLedger = Math.max(lastLedger, e.ledger);
      events.push({
        contractId: e.contractId,
        ledger: e.ledger,
        txHash: e.txHash,
        id: e.id,
        topics: e.topic.map((t) => scValToNative(t)),
        value: scValToNative(e.value),
      });
    }
    if (page.events.length === 0 || !page.cursor) {
      return { events, latestLedger, oldestLedger, throughLedger: Math.max(latestLedger, lastLedger) };
    }
    if (page.cursor === cursor) {
      throw new Error(
        `getEvents repeated cursor ${page.cursor} instead of advancing; stopped after ${events.length} events rather than looping forever`,
      );
    }
    cursor = page.cursor;
  }
}

/**
 * How many `getEvents` pages one read may request. At the ~100 events a page carries this is about
 * 5,000 events per pass: enough to keep up from a few minutes behind, and bounded so a pass lagging by
 * months takes several runs rather than one unbounded one inside a request timeout.
 */
const MAX_PAGES_PER_READ = 50;

/** Asked for 200 because that is what the indexer used to assume; the RPC answers with ~100. */
const EVENT_PAGE_LIMIT = 200;

/**
 * All events of one contract from `startLedger` up to the RPC's latest ledger.
 *
 * Only the first request carries `startLedger`: sending a cursor *and* a start ledger makes the RPC
 * ignore the cursor and re-serve the same page forever (also measured on testnet the same day).
 */
export async function contractEvents(config: ChainConfig, contractId: string, startLedger: number): Promise<EventPage> {
  const s = server(config);
  const filters = [{ type: "contract" as const, contractIds: [contractId] }];
  return paginateContractEvents(
    async (cursor) =>
      (await (cursor
        ? s.getEvents({ filters, cursor, limit: EVENT_PAGE_LIMIT })
        : s.getEvents({ filters, startLedger, limit: EVENT_PAGE_LIMIT }))) as unknown as RpcEventPage,
    startLedger,
  );
}


/** Reads a contract without sending a transaction (simulation only). */
export async function readContract(
  config: ChainConfig,
  source: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
): Promise<unknown> {
  const s = server(config);
  const account = await s.getAccount(source);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: config.networkPassphrase })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await s.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
    throw new Error(`${method} simulation failed: ${"error" in sim ? sim.error : "no result"}`);
  }
  return scValToNative(sim.result.retval);
}

export interface Submitted {
  txHash: string;
  ledger: number;
  returnValue: unknown;
}

/** Sends one contract call signed by `signer` and waits for it. */
export async function invoke(
  config: ChainConfig,
  signer: Keypair,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
): Promise<Submitted> {
  const s = server(config);
  const account = await s.getAccount(signer.publicKey());
  const built = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: config.networkPassphrase })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(60)
    .build();
  const tx = await s.prepareTransaction(built);
  tx.sign(signer);
  const sent = await s.sendTransaction(tx);
  if (sent.status === "ERROR") throw new Error(`${method} rejected: ${sent.errorResult?.toXDR("base64") ?? "unknown"}`);
  const final = await s.pollTransaction(sent.hash, { attempts: 30 });
  if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new Error(`${method} transaction ${sent.hash} ${final.status}`);
  return { txHash: sent.hash, ledger: final.ledger, returnValue: final.returnValue ? scValToNative(final.returnValue) : undefined };
}

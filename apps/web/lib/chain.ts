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
}

/** All events of one contract from `startLedger` up to the RPC's latest ledger. */
export async function contractEvents(config: ChainConfig, contractId: string, startLedger: number): Promise<EventPage> {
  const s = server(config);
  const events: RawEvent[] = [];
  let cursor: string | undefined;
  let latestLedger = 0;
  let oldestLedger = 0;
  for (;;) {
    const filters = [{ type: "contract" as const, contractIds: [contractId] }];
    const page = cursor
      ? await s.getEvents({ filters, cursor, limit: 200 })
      : await s.getEvents({ filters, startLedger, limit: 200 });
    latestLedger = page.latestLedger;
    oldestLedger = page.oldestLedger;
    for (const e of page.events) {
      events.push({
        contractId,
        ledger: e.ledger,
        txHash: e.txHash,
        id: e.id,
        topics: e.topic.map((t) => scValToNative(t)),
        value: scValToNative(e.value),
      });
    }
    if (page.events.length < 200) break;
    cursor = page.cursor;
  }
  return { events, latestLedger, oldestLedger };
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

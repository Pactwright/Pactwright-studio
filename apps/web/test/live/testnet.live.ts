/**
 * Live check of the indexer and anchorer against Stellar testnet and a real Postgres
 * (ROADMAP S-02, S-04). Sends real `anchor_batch` transactions; never runs in `pnpm test`.
 *
 *   DATABASE_URL=… ANCHORER_SECRET=S… STELLAR_NETWORK=testnet STELLAR_RPC_URL=… \
 *   PACT_CONTRACT_ID=… RECEIPT_ANCHOR_ID=… INDEX_START_LEDGER=… pnpm --filter web live:testnet
 *
 * After indexing and anchoring, every anchored certificate is checked twice: offline with
 * `verifyReceipt`, and on-chain with `ReceiptAnchor.verify_receipt`.
 */
import { describe, expect, it } from "vitest";
import { xdr } from "@stellar/stellar-sdk";
import { db } from "@/lib/db";
import { chainConfig, readContract } from "@/lib/chain";
import { sync } from "@/lib/indexer";
import { anchor, anchorerKey } from "@/lib/anchorer";
import { computeReceiptLeaf, verifyReceipt } from "@/lib/verify";
import type { Transition } from "@/lib/types";

const enabled = Boolean(process.env.ANCHORER_SECRET && process.env.DATABASE_URL);

describe.skipIf(!enabled)("indexer and anchorer on testnet", () => {
  it("indexes real events, anchors their receipts, and every proof verifies on-chain", async () => {
    const config = chainConfig();
    const signer = anchorerKey();

    const synced = await sync(config);
    console.log("sync:", JSON.stringify(synced));

    // Anchor everything pending (one batch per cycle).
    for (let i = 0; i < 5; i++) {
      const result = await anchor({ config, signer });
      console.log("anchor:", JSON.stringify(result));
      if (!result) break;
    }

    const rows = (
      await db().query<{
        leaf: string;
        pact_id: string;
        transition: Transition;
        to_seller_stroops: string;
        to_buyer_stroops: string;
        envelope_hash: string | null;
        ledger: number;
        batch_id: string;
        proof: string[];
        root: string;
        anchor_tx: string;
      }>(
        `SELECT r.*, b.root, b.anchor_tx FROM receipts r JOIN receipt_batches b ON b.batch_id = r.batch_id ORDER BY r.ledger`,
      )
    ).rows;
    expect(rows.length).toBeGreaterThan(0);

    for (const r of rows) {
      // The leaf is reproducible from the certificate's own inputs…
      expect(
        computeReceiptLeaf({
          pactId: r.pact_id,
          transition: r.transition,
          toSeller: r.to_seller_stroops,
          toBuyer: r.to_buyer_stroops,
          envelopeHash: r.envelope_hash,
          ledger: r.ledger,
        }),
      ).toBe(r.leaf.trim());
      // …its proof verifies offline…
      expect(verifyReceipt(r.leaf.trim(), r.proof, r.root.trim())).toBe(true);
      // …and the deployed ReceiptAnchor agrees.
      const onChain = await readContract(config, signer.publicKey(), config.receiptAnchorId, "verify_receipt", [
        xdr.ScVal.scvU64(new xdr.Uint64(BigInt(r.batch_id))),
        xdr.ScVal.scvBytes(Buffer.from(r.leaf.trim(), "hex")),
        xdr.ScVal.scvVec(r.proof.map((p) => xdr.ScVal.scvBytes(Buffer.from(p, "hex")))),
      ]);
      expect(onChain).toBe(true);
      console.log(`verified ${r.transition} ${r.pact_id.slice(0, 8)}… batch ${r.batch_id} tx ${r.anchor_tx}`);
    }
  }, 600_000);
});

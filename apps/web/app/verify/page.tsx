/** Certificate viewer: offline verifyReceipt() + on-chain verify_receipt. ROADMAP S-07, #55. */
import { CertificateCard, type CertificateData } from "@/components/CertificateCard";
import { ReceiptLeaf } from "@/components/illustrations";
import { LottieMark } from "@/components/LottieMark";
import { getCertificateById } from "@/lib/certificates";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams?: Promise<{ id?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const id = params?.id?.trim();
  let initialCertificate: CertificateData | undefined;

  if (id) {
    try {
      const cert = await getCertificateById(id);
      if (cert) {
        initialCertificate = {
          pactId: cert.pactId,
          transition: cert.transition,
          toSeller: cert.toSeller,
          toBuyer: cert.toBuyer,
          leaf: cert.leaf,
          leafInput: cert.leafInput,
          status: cert.status,
          proof: cert.proof,
          root: cert.root,
          batchId: cert.batchId,
          receiptAnchor: cert.receiptAnchor,
          anchorTx: cert.anchorTx,
          anchoredLedger: cert.anchoredLedger,
          onChainVerified: cert.onChainVerified,
        };
      }
    } catch (err) {
      console.error(`Failed to load certificate for id ${id}:`, err);
    }
  }

  return (
    <main className="shell">
      <article className="panel panel--head">
        <div className="head-split">
          <div>
            <h1>Verify Certificate</h1>
            <p className="lede">
              Every finished pact gets a receipt, and receipts are anchored on-chain in batches. Paste a receipt
              certificate, or choose the file it was saved as, to check it belongs to its anchored batch. The check runs
              in your browser; a chosen file is read here and never uploaded.
            </p>
          </div>
          <div className="head-plate">
            <ReceiptLeaf />
          </div>
        </div>
        <div className="doc-section">
          <CertificateCard initialCertificate={initialCertificate} />
        </div>
        <div className="verify-plate">
          <LottieMark
            src="/lottie/receipt-stitch.json"
            size={560}
            ratio={0.5}
            label="A receipt being stitched into a Merkle batch and stamped"
          />
          <p className="verify-plate-note">
            Each receipt becomes one leaf of a Merkle batch. The batch root is what gets anchored to Stellar, so one
            proof is enough to show this certificate belongs to it.
          </p>
        </div>
      </article>
    </main>
  );
}

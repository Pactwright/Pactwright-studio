/** Certificate viewer: offline verifyReceipt() + on-chain verify_receipt. ROADMAP S-07. */
import { CertificateCard } from "@/components/CertificateCard";

export default function VerifyPage() {
  return (
    <main className="shell">
      <article className="panel panel--feature">
        <h1>Verify Certificate</h1>
        <p className="lede">
          Every finished pact gets a receipt, and receipts are anchored on-chain in batches. Paste a receipt certificate to
          check it belongs to its anchored batch. The check runs in your browser; nothing is sent anywhere.
        </p>
        <div className="doc-section">
          <CertificateCard />
        </div>
      </article>
    </main>
  );
}

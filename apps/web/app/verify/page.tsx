/** Certificate viewer: offline verifyReceipt() + on-chain verify_receipt. ROADMAP S-07. */
import { CertificateCard } from "@/components/CertificateCard";

export default function VerifyPage() {
  return (
    <main className="max-w-4xl mx-auto p-6 font-sans">
      <h1 className="text-2xl font-bold mb-2 text-gray-900">Verify Certificate</h1>
      <p className="text-sm text-gray-600 mb-6">
        Verify terminal receipts offline using cryptographic sorted-pair Merkle proofs or inspect receipt anchor status.
      </p>
      <CertificateCard />
    </main>
  );
}

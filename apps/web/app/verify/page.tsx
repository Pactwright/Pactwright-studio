/** Certificate viewer: offline verifyReceipt() + on-chain verify_receipt. ROADMAP S-07. */
import { CertificateCard } from "@/components/CertificateCard";

export default function VerifyPage() {
  return (
    <main>
      <h1>Verify a certificate</h1>
      <CertificateCard />
    </main>
  );
}

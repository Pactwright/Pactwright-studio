"use client";

import { useState } from "react";
import { verifyReceipt } from "@/lib/verify";
import { Seal } from "@/components/Seal";
import { formatUsdc } from "@/lib/format";

export interface CertificateData {
  pactId: string;
  transition: string;
  toSeller: string;
  toBuyer: string;
  leaf: string;
  status: "pending" | "anchored";
  proof?: string[];
  root?: string;
  batchId?: number;
  receiptAnchor?: string;
}

/** Paste a certificate; shows pending/anchored and checks the Merkle proof in the browser. ROADMAP S-07. */
export function CertificateCard({ initialCertificate }: { initialCertificate?: CertificateData }) {
  const [certJson, setCertJson] = useState("");
  const [certificate, setCertificate] = useState<CertificateData | null>(initialCertificate ?? null);
  const [error, setError] = useState<string | null>(null);
  // Bumped on every inspection so the seal presses again for each certificate.
  const [inspections, setInspections] = useState(0);

  const handleInspect = () => {
    setError(null);
    try {
      const parsed = JSON.parse(certJson) as CertificateData;
      if (!parsed.leaf || !parsed.pactId) {
        throw new Error("This certificate is missing its pactId or leaf.");
      }
      setCertificate(parsed);
      setInspections((n) => n + 1);
    } catch (err) {
      setCertificate(null);
      setError(
        err instanceof SyntaxError
          ? "That isn't valid JSON. Paste the whole certificate, from the first { to the last }."
          : err instanceof Error
            ? err.message
            : "The certificate couldn't be read.",
      );
    }
  };

  const anchored = certificate?.status === "anchored";
  const isVerified = certificate?.root && certificate?.proof ? verifyReceipt(certificate.leaf, certificate.proof, certificate.root) : false;

  return (
    <div>
      <label htmlFor="certificate-json" className="field-label">
        Certificate (JSON)
      </label>
      <textarea
        id="certificate-json"
        value={certJson}
        onChange={(e) => setCertJson(e.target.value)}
        placeholder='{"pactId": "…", "transition": "settled", "leaf": "…", "root": "…", "proof": […], "status": "anchored"}'
        rows={6}
        spellCheck={false}
        className="typed-input"
      />
      <div className="actions">
        <button type="button" onClick={handleInspect} className="press">
          Inspect & Verify
        </button>
      </div>
      {error && (
        <p className="error-note" role="alert">
          {error}
        </p>
      )}

      {certificate && (
        <div className="certificate-result" aria-live="polite">
          <div>
            <div className="verdict-line">
              <span className="stamp stamp--small" data-ink={anchored ? "teal" : "indigo"}>
                {anchored ? "Anchored" : "Pending"}
              </span>
              <span
                data-testid="verification-badge"
                className="stamp stamp--small"
                data-ink={anchored ? (isVerified ? "teal" : "red") : "indigo"}
              >
                {anchored ? (isVerified ? "✓ Verified (Offline Merkle Proof)" : "✗ Invalid Merkle Proof") : "Pending Anchor"}
              </span>
            </div>
            <p className="prose">
              {anchored
                ? isVerified
                  ? "The receipt's leaf hashes up to the anchored root, so this receipt is in the anchored batch."
                  : "The proof doesn't lead from this leaf to the root. The certificate was altered or belongs to another batch."
                : "This receipt isn't anchored yet. Receipts are anchored in hourly batches; check again later."}
            </p>

            <dl className="form-grid">
              <div>
                <dt className="field-label">Pact</dt>
                <dd className="typed-value">
                  <a href={`/pact/${certificate.pactId}`}>{certificate.pactId}</a>
                </dd>
              </div>
              <div>
                <dt className="field-label">Outcome</dt>
                <dd className="typed-value">{certificate.transition}</dd>
              </div>
              <div>
                <dt className="field-label">To the seller</dt>
                <dd className="typed-value">{formatUsdc(certificate.toSeller)} USDC</dd>
              </div>
              <div>
                <dt className="field-label">To the buyer</dt>
                <dd className="typed-value">{formatUsdc(certificate.toBuyer)} USDC</dd>
              </div>
              <div>
                <dt className="field-label">Receipt leaf</dt>
                <dd className="typed-value">{certificate.leaf}</dd>
              </div>
              {certificate.root && (
                <div>
                  <dt className="field-label">Merkle root</dt>
                  <dd className="typed-value">{certificate.root}</dd>
                </div>
              )}
            </dl>
          </div>
          {anchored && isVerified && <Seal key={inspections} size={120} pressed label="Verified seal" />}
        </div>
      )}
    </div>
  );
}

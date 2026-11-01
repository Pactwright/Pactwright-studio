"use client";

import { useState, useEffect } from "react";
import { verifyReceipt, computeReceiptLeaf } from "@/lib/verify";
import { Seal } from "@/components/Seal";
import { formatUsdc } from "@/lib/format";
import { TxLink, ContractLink } from "@/components/TxLink";
import type { Transition } from "@/lib/types";

export interface CertificateData {
  pactId: string;
  transition: string;
  toSeller: string;
  toBuyer: string;
  leaf: string;
  leafInput?: {
    transition: string;
    toSellerStroops: string;
    toBuyerStroops: string;
    envelopeHash: string | null;
    ledger: number | null;
  };
  status: "pending" | "anchored";
  proof?: string[];
  root?: string;
  batchId?: number;
  receiptAnchor?: string;
  anchorTx?: string;
  anchoredLedger?: number;
  onChainVerified?: boolean;
}

/** Paste a certificate or inspect loaded certificate; separates offline Merkle proof and on-chain verification. ROADMAP S-07, #55. */
export function CertificateCard({ initialCertificate }: { initialCertificate?: CertificateData }) {
  const [certJson, setCertJson] = useState(() => (initialCertificate ? JSON.stringify(initialCertificate, null, 2) : ""));
  const [certificate, setCertificate] = useState<CertificateData | null>(initialCertificate ?? null);
  const [error, setError] = useState<string | null>(null);
  const [inspections, setInspections] = useState(0);
  const [onChainStatus, setOnChainStatus] = useState<"idle" | "checking" | "verified" | "failed">(() =>
    initialCertificate?.onChainVerified !== undefined
      ? initialCertificate.onChainVerified
        ? "verified"
        : "failed"
      : "idle"
  );

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
  const isOfflineVerified =
    certificate?.root && certificate?.proof ? verifyReceipt(certificate.leaf, certificate.proof, certificate.root) : false;

  // Recompute leaf if leafInput is present to flag tampering (ROADMAP S-07, #55)
  let recomputedLeaf: string | null = null;
  let leafMismatch = false;
  if (certificate?.leafInput && certificate.leafInput.ledger != null) {
    try {
      recomputedLeaf = computeReceiptLeaf({
        pactId: certificate.pactId,
        transition: certificate.leafInput.transition as Transition,
        toSeller: certificate.leafInput.toSellerStroops,
        toBuyer: certificate.leafInput.toBuyerStroops,
        envelopeHash: certificate.leafInput.envelopeHash,
        ledger: certificate.leafInput.ledger,
      });
      if (recomputedLeaf.toLowerCase() !== certificate.leaf.trim().toLowerCase()) {
        leafMismatch = true;
      }
    } catch {
      leafMismatch = true;
    }
  }

  // On-chain verification query when certificate is anchored
  useEffect(() => {
    if (!certificate || certificate.status !== "anchored" || certificate.batchId == null || !certificate.proof) {
      setOnChainStatus("idle");
      return;
    }
    if (certificate.onChainVerified !== undefined) {
      setOnChainStatus(certificate.onChainVerified ? "verified" : "failed");
      return;
    }
    let cancelled = false;
    setOnChainStatus("checking");
    fetch("/api/certificates/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        batchId: certificate.batchId,
        leaf: certificate.leaf,
        proof: certificate.proof,
        receiptAnchorId: certificate.receiptAnchor,
      }),
    })
      .then((res) => (res.ok ? res.json() : { verified: false }))
      .then((data: { verified?: boolean }) => {
        if (!cancelled) {
          setOnChainStatus(data.verified ? "verified" : "failed");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOnChainStatus("failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [certificate]);

  const isValidOverall = isOfflineVerified && !leafMismatch;

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
        className="field"
      />
      <div className="actions">
        <button type="button" onClick={handleInspect} className="cta">
          Inspect & Verify
        </button>
      </div>
      {error && (
        <p className="error-note" role="alert">
          {error}
        </p>
      )}

      {leafMismatch && (
        <p className="error-note" role="alert" data-testid="leaf-mismatch-alert">
          ⚠️ Leaf Mismatch: The recomputed leaf ({recomputedLeaf?.slice(0, 16)}…) does not match the certificate leaf ({certificate?.leaf.slice(0, 16)}…). This certificate has been altered.
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
                data-ink={isValidOverall ? "teal" : "red"}
              >
                {leafMismatch
                  ? "✗ Leaf Mismatch"
                  : isOfflineVerified
                    ? "✓ Consistent with this root (Offline Merkle Proof)"
                    : "✗ Invalid Merkle Proof"}
              </span>
              <span
                data-testid="onchain-badge"
                className="stamp stamp--small"
                data-ink={
                  onChainStatus === "verified"
                    ? "teal"
                    : anchored
                      ? onChainStatus === "checking"
                        ? "indigo"
                        : "red"
                      : "indigo"
                }
              >
                {anchored
                  ? onChainStatus === "verified"
                    ? `✓ Anchored on chain, seen at ledger ${certificate.anchoredLedger ?? "L"}`
                    : onChainStatus === "checking"
                      ? "Verifying on-chain…"
                      : "Unverifiable on-chain"
                  : "Pending Anchor"}
              </span>
            </div>
            <p className="prose">
              {anchored
                ? isValidOverall
                  ? onChainStatus === "verified"
                    ? `The receipt's leaf hashes up to the root, and the anchored batch #${certificate.batchId} was confirmed on-chain at ledger ${certificate.anchoredLedger ?? "L"}.`
                    : "The receipt's leaf hashes up to this root offline, but could not be verified against the ReceiptAnchor contract on-chain."
                  : "The proof does not lead from this leaf to the root. The certificate was altered or belongs to another batch."
                : "This receipt isn't anchored yet. Receipts are anchored in hourly batches; check again later."}
            </p>

            <dl className="form-grid">
              <div>
                <dt className="field-label">Pact</dt>
                <dd className="value">
                  <a href={`/pact/${certificate.pactId}`}>{certificate.pactId}</a>
                </dd>
              </div>
              <div>
                <dt className="field-label">Outcome</dt>
                <dd className="value">{certificate.transition}</dd>
              </div>
              <div>
                <dt className="field-label">To the seller</dt>
                <dd className="value">{formatUsdc(certificate.toSeller)} USDC</dd>
              </div>
              <div>
                <dt className="field-label">To the buyer</dt>
                <dd className="value">{formatUsdc(certificate.toBuyer)} USDC</dd>
              </div>
              <div>
                <dt className="field-label">Receipt leaf</dt>
                <dd className="value">{certificate.leaf}</dd>
              </div>
              {certificate.root && (
                <div>
                  <dt className="field-label">Merkle root</dt>
                  <dd className="value">{certificate.root}</dd>
                </div>
              )}
              {certificate.batchId != null && (
                <div>
                  <dt className="field-label">Batch ID</dt>
                  <dd className="value" data-testid="batch-id">
                    <span>#{certificate.batchId}</span>
                    {certificate.anchorTx && (
                      <span style={{ marginLeft: "0.5rem" }}>
                        (<TxLink hash={certificate.anchorTx} />)
                      </span>
                    )}
                    {certificate.receiptAnchor && (
                      <span style={{ marginLeft: "0.5rem" }}>
                        Contract: <ContractLink contractId={certificate.receiptAnchor} />
                      </span>
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </div>
          {isValidOverall && <Seal key={inspections} size={120} pressed label="Verified seal" />}
        </div>
      )}
    </div>
  );
}

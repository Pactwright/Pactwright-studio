"use client";

import { useEffect, useState } from "react";
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

/** A certificate is a leaf, a root and a few amounts — a bigger file was not meant for this page. */
export const MAX_CERT_BYTES = 256 * 1024;

/** What the offline check concludes about one certificate. */
export interface CertificateVerification {
  offlineVerified: boolean;
  leafMismatch: boolean;
  recomputedLeaf: string | null;
}

function formatKiB(bytes: number): string {
  const kib = bytes / 1024;
  // Rounded up, so a file over the limit never reads as exactly the limit it broke.
  return kib < 10 ? `${kib.toFixed(1)} KiB` : `${Math.ceil(kib)} KiB`;
}

/** A chosen file, reduced to the one sentence a visitor needs when it is not a certificate. */
export function fileProblem(files: File[]): string | null {
  if (files.length === 0) return "Nothing was chosen. Pick the one .json file Studio gave you.";
  if (files.length > 1) return `One certificate at a time — ${files.length} files were given.`;
  const file = files[0];
  if (!/\.json$/i.test(file.name)) return `${file.name} isn't a .json file. Choose the certificate file itself.`;
  if (file.size > MAX_CERT_BYTES)
    return `${file.name} is ${formatKiB(file.size)}, and a certificate is at most ${formatKiB(MAX_CERT_BYTES)}.`;
  return null;
}

/** Read the chosen file here, in this browser. It has no network in it — that is the point. */
export async function readCertificateFile(file: File): Promise<{ text: string; error: null } | { text: null; error: string }> {
  try {
    return { text: await file.text(), error: null };
  } catch {
    return { text: null, error: `${file.name} could not be read from disk. Try choosing it again.` };
  }
}

/** Parse a pasted or loaded certificate, returning the reason it is not one instead of throwing. */
export function parseCertificate(
  text: string
): { certificate: CertificateData; error: null } | { certificate: null; error: string } {
  if (!text.trim()) return { certificate: null, error: "There is no certificate here yet — paste one, or choose the file it came from." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      certificate: null,
      error: "That isn't valid JSON. Paste the whole certificate, or choose the file it came from — from the first { to the last }.",
    };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return { certificate: null, error: "A certificate is one JSON object with a pactId and a leaf, not a list or a plain value." };
  const certificate = parsed as CertificateData;
  if (typeof certificate.leaf !== "string" || typeof certificate.pactId !== "string")
    return { certificate: null, error: "This certificate is missing its pactId or leaf." };
  return { certificate, error: null };
}

/**
 * The offline half of S-07: does this leaf hash up to this root, and does the certificate still
 * describe the receipt its own inputs hash to? `lib/verify` wants `node:crypto`, so it is loaded on
 * demand rather than shipped with the page — that eager polyfill was #89's `/verify` margin.
 */
export async function verifyOffline(
  certificate: CertificateData
): Promise<{ verification: CertificateVerification; error: null } | { verification: null; error: string }> {
  const hasProof = Boolean(certificate.root && certificate.proof);
  const input = certificate.leafInput;
  const hasLeafInput = Boolean(input && input.ledger != null);
  if (!hasProof && !hasLeafInput)
    return { verification: { offlineVerified: false, leafMismatch: false, recomputedLeaf: null }, error: null };

  let verifyReceipt: (leaf: string, proof: string[], root: string) => boolean;
  let computeReceiptLeaf: (params: {
    pactId: string;
    transition: Transition;
    toSeller: string;
    toBuyer: string;
    envelopeHash: string | null;
    ledger: number;
  }) => string;
  try {
    ({ verifyReceipt, computeReceiptLeaf } = await import("@/lib/verify"));
  } catch {
    return { verification: null, error: "The offline checker could not be loaded, so this proof was not checked." };
  }

  const offlineVerified = hasProof
    ? verifyReceipt(certificate.leaf, certificate.proof as string[], certificate.root as string)
    : false;
  let recomputedLeaf: string | null = null;
  let leafMismatch = false;
  if (hasLeafInput && input) {
    try {
      recomputedLeaf = computeReceiptLeaf({
        pactId: certificate.pactId,
        transition: input.transition as Transition,
        toSeller: input.toSellerStroops,
        toBuyer: input.toBuyerStroops,
        envelopeHash: input.envelopeHash,
        ledger: input.ledger as number,
      });
      leafMismatch = recomputedLeaf.toLowerCase() !== certificate.leaf.trim().toLowerCase();
    } catch {
      leafMismatch = true;
    }
  }
  return { verification: { offlineVerified, leafMismatch, recomputedLeaf }, error: null };
}

/** Paste or load a certificate; separates the offline Merkle proof from the on-chain anchor check. ROADMAP S-07, #55, studio#86. */
export function CertificateCard({ initialCertificate }: { initialCertificate?: CertificateData }) {
  const [certJson, setCertJson] = useState(() => (initialCertificate ? JSON.stringify(initialCertificate, null, 2) : ""));
  const [certificate, setCertificate] = useState<CertificateData | null>(initialCertificate ?? null);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [loadedFrom, setLoadedFrom] = useState<{ name: string; bytes: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [inspections, setInspections] = useState(0);
  const [verification, setVerification] = useState<CertificateVerification | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [onChainStatus, setOnChainStatus] = useState<"idle" | "checking" | "verified" | "failed">(() =>
    initialCertificate?.onChainVerified !== undefined
      ? initialCertificate.onChainVerified
        ? "verified"
        : "failed"
      : "idle"
  );

  const inspect = (text: string) => {
    const { certificate: parsed, error: reason } = parseCertificate(text);
    setError(reason);
    setCertificate(parsed);
    if (parsed) setInspections((n) => n + 1);
    return { parsed, reason };
  };

  /** Reads the file in this browser and hands its text to the same parser the paste box uses. */
  const loadFiles = async (files: File[]) => {
    const problem = fileProblem(files);
    if (problem) {
      setFileError(problem);
      setLoadedFrom(null);
      return;
    }
    const file = files[0];
    const { text, error: readError } = await readCertificateFile(file);
    if (text === null) {
      setFileError(readError);
      setLoadedFrom(null);
      return;
    }
    const { parsed, reason } = inspect(text);
    if (parsed) {
      setCertJson(text);
      setFileError(null);
      setLoadedFrom({ name: file.name, bytes: file.size });
    } else {
      setFileError(`From ${file.name}: ${reason}`);
      setLoadedFrom(null);
    }
  };

  const anchored = certificate?.status === "anchored";
  const isOfflineVerified = verification?.offlineVerified ?? false;
  const leafMismatch = verification?.leafMismatch ?? false;
  const recomputedLeaf = verification?.recomputedLeaf ?? null;
  const isChecking = certificate !== null && verification === null && checkError === null;

  // The offline check runs here, in the browser, on whatever certificate is showing.
  useEffect(() => {
    if (!certificate) {
      setVerification(null);
      setCheckError(null);
      return;
    }
    let cancelled = false;
    setVerification(null);
    setCheckError(null);
    void verifyOffline(certificate).then((result) => {
      if (cancelled) return;
      if (result.error) setCheckError(result.error);
      else setVerification(result.verification);
    });
    return () => {
      cancelled = true;
    };
  }, [certificate]);

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
        <button type="button" onClick={() => inspect(certJson)} className="cta">
          Inspect & Verify
        </button>
      </div>
      {error && (
        <p className="error-note" role="alert">
          {error}
        </p>
      )}

      <div className="actions">
        <label htmlFor="certificate-file" className="field-label">
          Or load a certificate file (.json, up to {Math.round(MAX_CERT_BYTES / 1024)} KiB)
        </label>
        <div
          data-testid="certificate-dropzone"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void loadFiles(Array.from(e.dataTransfer.files));
          }}
          style={{
            border: `1px dashed ${dragOver ? "var(--focus)" : "var(--hairline-strong)"}`,
            borderRadius: 10,
            padding: 12,
            marginTop: 8,
          }}
        >
          <p className="prose">
            Drop a certificate file here. It is read in this browser and never uploaded — the check below is what decides
            whether it is genuine.
          </p>
          <input
            id="certificate-file"
            type="file"
            accept="application/json,.json"
            className="field"
            aria-describedby={fileError || loadedFrom ? "certificate-file-note" : undefined}
            onChange={(e) => {
              void loadFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
        {fileError ? (
          <p id="certificate-file-note" className="error-note" role="alert" data-testid="file-error">
            {fileError}
          </p>
        ) : loadedFrom ? (
          <p id="certificate-file-note" className="notice" data-testid="file-loaded">
            Loaded {loadedFrom.name} ({formatKiB(loadedFrom.bytes)}) from your machine — nothing was uploaded.
          </p>
        ) : null}
      </div>

      {checkError && (
        <p className="error-note" role="alert" data-testid="check-error">
          {checkError}
        </p>
      )}

      {leafMismatch && (
        <p className="error-note" role="alert" data-testid="leaf-mismatch-alert">
          ⚠️ Leaf Mismatch: The recomputed leaf ({recomputedLeaf?.slice(0, 16)}…) does not match the certificate leaf (
          {certificate?.leaf.slice(0, 16)}…). This certificate has been altered.
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
                data-ink={isChecking ? "indigo" : isValidOverall ? "teal" : "red"}
              >
                {isChecking
                  ? "Checking the proof in this browser…"
                  : leafMismatch
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
              {isChecking
                ? "Checking this receipt against its Merkle root, in this browser."
                : anchored
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

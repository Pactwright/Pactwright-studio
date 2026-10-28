"use client";

import { useState } from "react";
import { verifyReceipt } from "@/lib/verify";

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
  shardId?: number;
  receiptAnchor?: string;
}

/** Paste a certificate or pact ID; shows pending/anchored and verification results. ROADMAP S-07. */
export function CertificateCard({ initialCertificate }: { initialCertificate?: CertificateData }) {
  const [certJson, setCertJson] = useState("");
  const [certificate, setCertificate] = useState<CertificateData | null>(initialCertificate ?? null);
  const [error, setError] = useState<string | null>(null);

  const handleInspect = () => {
    setError(null);
    try {
      const parsed = JSON.parse(certJson) as CertificateData;
      if (!parsed.leaf || !parsed.pactId) {
        throw new Error("Invalid certificate: missing required fields 'pactId' and 'leaf'.");
      }
      setCertificate(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse certificate JSON");
    }
  };

  const isVerified = certificate?.root && certificate?.proof
    ? verifyReceipt(certificate.leaf, certificate.proof, certificate.root)
    : false;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm max-w-2xl font-sans">
      <div className="mb-4">
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Paste Certificate JSON
        </label>
        <textarea
          value={certJson}
          onChange={(e) => setCertJson(e.target.value)}
          placeholder='{"pactId": "...", "transition": "settled", "leaf": "...", "root": "...", "proof": [...], "status": "anchored"}'
          rows={5}
          className="w-full p-2.5 border border-gray-300 rounded font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={handleInspect}
            className="px-4 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 transition-colors"
          >
            Inspect & Verify
          </button>
        </div>
        {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
      </div>

      {certificate && (
        <div className="border-t pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-medium text-gray-500">Status</span>
            <span
              className={`px-2 py-0.5 rounded text-xs font-semibold ${
                certificate.status === "anchored"
                  ? "bg-green-100 text-green-800"
                  : "bg-yellow-100 text-yellow-800"
              }`}
            >
              {certificate.status.toUpperCase()}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-medium text-gray-500">Offline Proof Verification</span>
            <span
              data-testid="verification-badge"
              className={`px-2 py-0.5 rounded text-xs font-semibold ${
                certificate.status === "anchored"
                  ? isVerified
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {certificate.status === "anchored"
                ? isVerified
                  ? "✓ Verified (Offline Merkle Proof)"
                  : "✗ Invalid Merkle Proof"
                : "Pending Anchor"}
            </span>
          </div>

          <div>
            <span className="text-xs text-gray-500 block">Pact ID</span>
            <code className="text-xs font-mono break-all text-gray-900">{certificate.pactId}</code>
          </div>

          <div>
            <span className="text-xs text-gray-500 block">Transition</span>
            <span className="text-xs font-mono capitalize">{certificate.transition}</span>
          </div>

          <div>
            <span className="text-xs text-gray-500 block">Receipt Leaf</span>
            <code className="text-xs font-mono break-all text-gray-900">{certificate.leaf}</code>
          </div>

          {certificate.root && (
            <div>
              <span className="text-xs text-gray-500 block">Merkle Root</span>
              <code className="text-xs font-mono break-all text-gray-900">{certificate.root}</code>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-xs pt-1">
            <div>
              <span className="text-gray-500 block">To Seller</span>
              <span className="font-mono font-medium">{certificate.toSeller} USDC</span>
            </div>
            <div>
              <span className="text-gray-500 block">To Buyer</span>
              <span className="font-mono font-medium">{certificate.toBuyer} USDC</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

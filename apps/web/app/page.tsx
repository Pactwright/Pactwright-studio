export default function Home() {
  return (
    <main className="max-w-4xl mx-auto p-8 font-sans">
      <div className="border-b pb-4 mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Pactwright Studio</h1>
        <p className="text-sm text-gray-600 mt-1">
          Every agent purchase is a pact. Public timeline, certificates, merchant analytics, and principal budgeting.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <a
          href="/pact/1111111111111111111111111111111111111111111111111111111111111111"
          className="p-5 border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-sm transition-all"
        >
          <h2 className="text-lg font-bold text-blue-600 mb-1">Pact Timeline</h2>
          <p className="text-xs text-gray-500">
            Inspect live lifecycle stages, verdict attestations, and explorer links for seeded or on-chain pacts.
          </p>
        </a>

        <a
          href="/verify"
          className="p-5 border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-sm transition-all"
        >
          <h2 className="text-lg font-bold text-blue-600 mb-1">Certificate Viewer</h2>
          <p className="text-xs text-gray-500">
            Verify anchored receipts offline using cryptographic sorted-pair Merkle proofs.
          </p>
        </a>

        <a
          href="/merchant"
          className="p-5 border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-sm transition-all"
        >
          <h2 className="text-lg font-bold text-blue-600 mb-1">Merchant Dashboard</h2>
          <p className="text-xs text-gray-500">
            Review seller revenue, reliability metrics, dispute rates, and pricing per registered route.
          </p>
        </a>

        <a
          href="/principal"
          className="p-5 border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-sm transition-all"
        >
          <h2 className="text-lg font-bold text-blue-600 mb-1">Principal View</h2>
          <p className="text-xs text-gray-500">
            Monitor autonomous agent accounts, funded USDC budgets, and currently active live pacts.
          </p>
        </a>
      </div>
    </main>
  );
}

/** Public pact timeline. ROADMAP S-06. */
import { getPactById } from "@/lib/pacts";
import { Timeline } from "@/components/Timeline";
import { StateBadge } from "@/components/StateBadge";
import { AccountLink } from "@/components/TxLink";

export default async function PactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data = null;
  try {
    data = await getPactById(id);
  } catch {
    // Falls through to empty / not found view
  }

  if (!data) {
    return (
      <main className="max-w-4xl mx-auto p-6 font-sans">
        <h1 className="text-2xl font-bold mb-4">Pact {id}</h1>
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
          Pact not found. Check the pact identifier or verify that local seed data is loaded.
        </div>
      </main>
    );
  }

  const { pact, events } = data;

  return (
    <main className="max-w-4xl mx-auto p-6 font-sans">
      <header className="flex items-center justify-between border-b pb-4 mb-6">
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wider block">Pact ID</span>
          <h1 className="text-xl font-mono font-bold break-all text-gray-900">{pact.pact_id}</h1>
        </div>
        <StateBadge state={pact.state} />
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 bg-gray-50 p-4 rounded-lg border border-gray-100">
        <div>
          <span className="text-xs text-gray-500 block">Mode</span>
          <span className="font-medium text-sm capitalize">{pact.mode}</span>
        </div>
        <div>
          <span className="text-xs text-gray-500 block">Cap</span>
          <span className="font-mono text-sm">{pact.cap} USDC</span>
        </div>
        <div>
          <span className="text-xs text-gray-500 block">Buyer</span>
          <AccountLink address={pact.buyer} />
        </div>
        <div>
          <span className="text-xs text-gray-500 block">Seller</span>
          <AccountLink address={pact.seller} />
        </div>
        <div>
          <span className="text-xs text-gray-500 block">Settled to Seller</span>
          <span className="font-mono text-sm">{pact.to_seller} USDC</span>
        </div>
        <div>
          <span className="text-xs text-gray-500 block">Refunded to Buyer</span>
          <span className="font-mono text-sm">{pact.to_buyer} USDC</span>
        </div>
        <div>
          <span className="text-xs text-gray-500 block">Resource URL</span>
          <a
            href={pact.resource_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline break-all"
          >
            {pact.resource_url}
          </a>
        </div>
        <div>
          <span className="text-xs text-gray-500 block">Silence Action</span>
          <span className="font-mono text-sm capitalize">{pact.silence ?? "none"}</span>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-3 text-gray-900">Lifecycle Timeline</h2>
        <Timeline pactId={pact.pact_id} events={events} />
      </section>
    </main>
  );
}

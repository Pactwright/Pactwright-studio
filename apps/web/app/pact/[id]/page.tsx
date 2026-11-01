/** Public pact timeline. ROADMAP S-06, S-07. */
import { notFound } from "next/navigation";
import { getPactById } from "@/lib/pacts";
import { Timeline } from "@/components/Timeline";
import { StateBadge } from "@/components/StateBadge";
import { AccountLink } from "@/components/TxLink";
import { Seal } from "@/components/Seal";
import { formatUsdc, modeName, silenceName } from "@/lib/format";

export default async function PactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Validate 64-hex format before query
  if (!id || !/^[0-9a-fA-F]{64}$/.test(id)) {
    notFound();
  }

  // Allow database errors to bubble to error.tsx boundary so HTTP 500 is served instead of fake 404
  const data = await getPactById(id);

  if (!data) {
    notFound();
  }

  const { pact, events } = data;

  return (
    <main className="shell">
      <article className="panel panel--feature">
        <header className="pact-head">
          <div>
            <span className="field-label">Pact ID</span>
            <h1 className="id-heading">{pact.pact_id}</h1>
            <div className="pact-stamp">
              <StateBadge state={pact.state} size="large" />
            </div>
          </div>
          <Seal size={96} />
        </header>

        <dl className="form-grid">
          <div>
            <dt className="field-label">Cap</dt>
            <dd className="value">{formatUsdc(pact.cap)} USDC</dd>
          </div>
          <div>
            <dt className="field-label">Mode</dt>
            <dd className="value">{modeName(pact.mode)}</dd>
          </div>
          <div>
            <dt className="field-label">Paid to the seller</dt>
            <dd className="value">{formatUsdc(pact.to_seller)} USDC</dd>
          </div>
          <div>
            <dt className="field-label">Returned to the buyer</dt>
            <dd className="value">{formatUsdc(pact.to_buyer)} USDC</dd>
          </div>
          <div>
            <dt className="field-label">Buyer</dt>
            <dd className="value">
              <AccountLink address={pact.buyer} />
            </dd>
          </div>
          <div>
            <dt className="field-label">Seller</dt>
            <dd className="value">
              <AccountLink address={pact.seller} />
            </dd>
          </div>
          <div>
            <dt className="field-label">Condition hash</dt>
            <dd className="value mono">
              <code className="hash-code">{pact.condition_hash}</code>
            </dd>
          </div>
          <div>
            <dt className="field-label">Metered</dt>
            <dd className="value">{pact.metered ? "Yes (Units)" : "No"}</dd>
          </div>
          <div>
            <dt className="field-label">Verdict deadline</dt>
            <dd className="value">{pact.verdict_deadline ? `Ledger #${pact.verdict_deadline}` : "None"}</dd>
          </div>
          <div>
            <dt className="field-label">Settle deadline</dt>
            <dd className="value">{pact.settle_deadline ? `Ledger #${pact.settle_deadline}` : "None"}</dd>
          </div>
          <div>
            <dt className="field-label">If no verdict arrives in time</dt>
            <dd className="value">{silenceName(pact.silence)}</dd>
          </div>
          <div>
            <dt className="field-label">What was bought</dt>
            <dd className="value">
              {pact.resource_url ? (
                <a href={pact.resource_url} target="_blank" rel="noopener noreferrer">
                  {pact.resource_url}
                </a>
              ) : (
                "Resource URL held off-chain by buyer and seller under condition hash"
              )}
            </dd>
          </div>
        </dl>

        {pact.condition && Object.keys(pact.condition).length > 0 && (
          <section aria-labelledby="condition-title" style={{ marginTop: "1.5rem" }}>
            <h2 id="condition-title" className="field-label">
              Agreed condition
            </h2>
            <pre className="raw-event" style={{ marginTop: "0.5rem" }}>
              <code>{JSON.stringify(pact.condition, null, 2)}</code>
            </pre>
          </section>
        )}
      </article>

      <section aria-labelledby="timeline-title">
        <h2 id="timeline-title" className="chain-title">
          What happened
        </h2>
        <Timeline pactId={pact.pact_id} events={events} />
      </section>
    </main>
  );
}

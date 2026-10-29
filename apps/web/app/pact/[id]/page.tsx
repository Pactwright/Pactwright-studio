/** Public pact timeline. ROADMAP S-06. */
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

  let data = null;
  try {
    data = await getPactById(id);
  } catch {
    // Falls through to the not-found view
  }

  if (!data) {
    return (
      <main className="desk">
        <article className="document">
          <span className="field-label">Pact ID</span>
          <h1 className="id-heading">{id}</h1>
          <p className="notice">
            No pact with this ID has been indexed. Check the ID; a pact opened in the last few minutes may not be indexed yet.
          </p>
          <p className="prose">
            <a href="/">Look up another pact</a>
          </p>
        </article>
      </main>
    );
  }

  const { pact, events } = data;

  return (
    <main className="desk">
      <article className="document document--watermark">
        <header className="pact-head">
          <div>
            <span className="field-label">Pact ID</span>
            <h1>{pact.pact_id}</h1>
            <div className="pact-stamp">
              <StateBadge state={pact.state} size="large" />
            </div>
          </div>
          <Seal size={96} />
        </header>

        <dl className="form-grid">
          <div>
            <dt className="field-label">Cap</dt>
            <dd className="typed-value">{formatUsdc(pact.cap)} USDC</dd>
          </div>
          <div>
            <dt className="field-label">Mode</dt>
            <dd className="typed-value">{modeName(pact.mode)}</dd>
          </div>
          <div>
            <dt className="field-label">Paid to the seller</dt>
            <dd className="typed-value">{formatUsdc(pact.to_seller)} USDC</dd>
          </div>
          <div>
            <dt className="field-label">Returned to the buyer</dt>
            <dd className="typed-value">{formatUsdc(pact.to_buyer)} USDC</dd>
          </div>
          <div>
            <dt className="field-label">Buyer</dt>
            <dd className="typed-value">
              <AccountLink address={pact.buyer} />
            </dd>
          </div>
          <div>
            <dt className="field-label">Seller</dt>
            <dd className="typed-value">
              <AccountLink address={pact.seller} />
            </dd>
          </div>
          <div>
            <dt className="field-label">If no verdict arrives in time</dt>
            <dd className="typed-value">{silenceName(pact.silence)}</dd>
          </div>
          <div>
            <dt className="field-label">What was bought</dt>
            <dd className="typed-value">
              {pact.resource_url ? (
                <a href={pact.resource_url} target="_blank" rel="noopener noreferrer">
                  {pact.resource_url}
                </a>
              ) : (
                "Not recorded on\u2011chain"
              )}
            </dd>
          </div>
        </dl>
      </article>

      <section aria-labelledby="timeline-title">
        <h2 id="timeline-title" className="stubs-title">
          What happened
        </h2>
        <Timeline pactId={pact.pact_id} events={events} />
      </section>
    </main>
  );
}

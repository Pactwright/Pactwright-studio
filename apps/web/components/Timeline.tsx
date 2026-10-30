import type { PactEventRow } from "@/lib/types";
import { TxLink } from "@/components/TxLink";
import { describeEvent } from "@/lib/format";

export interface TimelineProps {
  pactId: string;
  events?: PactEventRow[];
}

/** Pact stages as perforated receipt stubs, in ledger order, with tx links. ROADMAP S-06. */
export function Timeline({ pactId, events = [] }: TimelineProps) {
  if (events.length === 0) {
    return (
      <p className="empty-note">
        Nothing has happened to pact <code>{pactId.slice(0, 8)}…</code> on-chain yet. Events appear here a few minutes after
        they land.
      </p>
    );
  }

  return (
    <ol className="chain">
      {events.map((event, idx) => {
        const { title, detail, ink } = describeEvent(event);
        return (
          <li key={event.id ?? idx} className="block">
            <div className="block-head">
              <span className="stamp" data-ink={ink}>
                {title}
              </span>
              {event.ledger != null && <span className="block-height">Ledger {event.ledger}</span>}
            </div>
            <div className="block-body">
              <p>{detail}</p>
              {event.tx_hash && (
                <span className="block-meta">
                  Transaction <TxLink hash={event.tx_hash} />
                </span>
              )}
              {event.data && Object.keys(event.data).length > 0 && (
                <details className="raw-event">
                  <summary>Event as indexed</summary>
                  <pre>{JSON.stringify(event.data, null, 2)}</pre>
                </details>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

import type { PactEventRow } from "@/lib/types";
import { TxLink } from "@/components/TxLink";

export interface TimelineProps {
  pactId: string;
  events?: PactEventRow[];
}

/** Pact stages with tx links and status. ROADMAP S-06. */
export function Timeline({ pactId, events = [] }: TimelineProps) {
  if (events.length === 0) {
    return (
      <div className="py-4 text-gray-500 italic text-sm">
        <p>No lifecycle events recorded yet for pact <code>{pactId}</code>.</p>
      </div>
    );
  }

  return (
    <div className="relative border-l-2 border-gray-200 ml-3 my-4 space-y-6">
      {events.map((event, idx) => (
        <div key={event.id ?? idx} className="relative pl-6">
          {/* Timeline node */}
          <span className="absolute -left-2 top-1.5 w-4 h-4 rounded-full bg-blue-600 ring-4 ring-white" />

          <div className="bg-white p-4 rounded border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                Stage: {event.stage}
              </span>
              {event.ledger != null && (
                <span className="text-xs text-gray-500 font-mono">
                  Ledger #{event.ledger}
                </span>
              )}
            </div>

            {event.tx_hash && (
              <div className="text-xs text-gray-600 mb-2">
                <span className="mr-1">Transaction:</span>
                <TxLink hash={event.tx_hash} />
              </div>
            )}

            {event.data && Object.keys(event.data).length > 0 && (
              <pre className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-800 font-mono overflow-x-auto">
                {JSON.stringify(event.data, null, 2)}
              </pre>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

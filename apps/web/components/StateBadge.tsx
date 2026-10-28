import type { PactState } from "@/lib/types";

export function StateBadge({ state }: { state: PactState }) {
  return <span data-state={state}>{state}</span>;
}

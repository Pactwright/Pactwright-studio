import type { PactState } from "@/lib/types";
import { stateStamp } from "@/lib/format";

/** A pact's state as a rubber-stamp impression: green ink when money moved as agreed, red when it came back. */
export function StateBadge({ state, size = "small" }: { state: PactState; size?: "small" | "large" }) {
  const { word, ink } = stateStamp(state);
  return (
    <span className={`stamp stamp--${size}`} data-state={state} data-ink={ink}>
      {word}
    </span>
  );
}

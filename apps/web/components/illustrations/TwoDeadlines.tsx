import type { CSSProperties } from "react";

/** Reveal stagger shared by every illustration; see illustrations.css. */
const step = (i: number) => ({ "--i": i } as CSSProperties);

/**
 * A pact's two gates on one rail: the verdict deadline, then the settle
 * deadline, with the clock arc that runs between them. There is no single
 * expiry — the gap is the point, so the window is stamped in `--accent-subtle`.
 *
 * Animatable: the rail (draw), the two deadline ticks (draw), the clock (draw).
 */
export function TwoDeadlines({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      className={`illu illu--two-deadlines ${className ?? ""}`}
      viewBox="0 0 480 320"
      fill="none"
      stroke="var(--bone)"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable={title ? undefined : "false"}
    >
      {/* The window between the gates: neither paid nor refunded yet. */}
      <rect x={180} y={190} width={140} height={12} fill="var(--accent-subtle)" stroke="none" />

      {/* A dotted ledger baseline under the rail. */}
      <path
        d="M56 228 H424"
        stroke="var(--hairline-strong)"
        strokeWidth={1.5}
        strokeDasharray="1 7"
        vectorEffect="non-scaling-stroke"
      />

      {/* The rail, with a terminal tick at each end. */}
      <path
        className="illu-draw"
        style={step(0)}
        pathLength={1}
        d="M56 184 V208 M56 196 H424 M424 184 V208"
        stroke="var(--bone)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />

      {/* Verdict marker: a filled brass stamp. */}
      <circle cx={180} cy={128} r={12} stroke="var(--brass)" strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
      <circle cx={180} cy={128} r={8} fill="var(--brass)" stroke="none" />

      {/* Settle marker: the same stamp, still hollow. */}
      <circle cx={320} cy={128} r={12} stroke="var(--brass)" strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
      <circle cx={320} cy={128} r={8} stroke="var(--brass)" strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
      <circle cx={320} cy={128} r={2.5} fill="var(--brass)" stroke="none" />

      {/* The two deadline ticks, brass, cut above and below the rail. */}
      <path
        className="illu-draw"
        style={step(1)}
        pathLength={1}
        d="M180 140 V252 M172 140 H188 M172 252 H188 M320 140 V252 M312 140 H328 M312 252 H328"
        stroke="var(--brass)"
        strokeWidth={2.5}
        vectorEffect="non-scaling-stroke"
      />

      {/* The clock between them: ticks, sweep, hand, drawn as one stroke. */}
      <path
        className="illu-draw"
        style={step(2)}
        pathLength={1}
        d="M196 142 A54 54 0 0 1 304 142 M250 88 V98 M211.8 103.8 L218.9 110.9 M288.2 103.8 L281.1 110.9 M250 142 L232 110"
        stroke="var(--brass)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={250} cy={142} r={3} fill="var(--brass)" stroke="none" />

      {/* The two gates, named in the register's faint ink. */}
      <text x={180} y={268} textAnchor="middle" fontSize={13} letterSpacing={1} fill="var(--faint)" stroke="none">
        verdict
      </text>
      <text x={320} y={268} textAnchor="middle" fontSize={13} letterSpacing={1} fill="var(--faint)" stroke="none">
        settle
      </text>
    </svg>
  );
}

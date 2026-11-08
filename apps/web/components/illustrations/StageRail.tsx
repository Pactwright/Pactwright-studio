import type { CSSProperties } from "react";

/** Reveal stagger shared by every illustration; see illustrations.css. */
const step = (i: number) => ({ "--i": i } as CSSProperties);

/**
 * The process rail, left to right: opened, funded, delivered, verified, then
 * settled in moss with the wax struck on the last stamp. Five stamps, one rail,
 * no step skipped.
 *
 * Animatable: the rail (draw), the settled stamp (pop), the wax seal (pop).
 */
export function StageRail({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      className={`illu illu--stage-rail ${className ?? ""}`}
      viewBox="0 0 960 160"
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
      {/* The rail itself. */}
      <path
        className="illu-draw"
        style={step(0)}
        pathLength={1}
        d="M88 74 H872"
        stroke="var(--bone)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />

      {/* Measure ticks between the stamps. */}
      <path
        d="M186 68 V80 M382 68 V80 M578 68 V80 M774 68 V80"
        stroke="var(--hairline-strong)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />

      {/* Opened: a gate standing open. */}
      <circle cx={88} cy={74} r={25} fill="var(--surface-raised)" stroke="var(--bone)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <circle cx={88} cy={74} r={17} stroke="var(--hairline-strong)" strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
      <path d="M79 83 V72 A9 9 0 0 1 97 72 V83" stroke="var(--bone)" strokeWidth={2} fill="none" vectorEffect="non-scaling-stroke" />

      {/* Funded: one coin in the box. */}
      <circle cx={284} cy={74} r={25} fill="var(--surface-raised)" stroke="var(--bone)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <circle cx={284} cy={74} r={17} stroke="var(--hairline-strong)" strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
      <circle cx={284} cy={74} r={9} stroke="var(--bone)" strokeWidth={2} fill="none" vectorEffect="non-scaling-stroke" />
      <circle cx={284} cy={74} r={3.5} stroke="var(--bone)" strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />

      {/* Delivered: the seller's package landing on the tray. */}
      <circle cx={480} cy={74} r={25} fill="var(--surface-raised)" stroke="var(--bone)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <circle cx={480} cy={74} r={17} stroke="var(--hairline-strong)" strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
      <path d="M480 62 V82 M473 75 L480 82 L487 75 M469 88 H491" stroke="var(--bone)" strokeWidth={2} fill="none" vectorEffect="non-scaling-stroke" />

      {/* Verified: the verdict, checked. */}
      <circle cx={676} cy={74} r={25} fill="var(--surface-raised)" stroke="var(--bone)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <circle cx={676} cy={74} r={17} stroke="var(--hairline-strong)" strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
      <path d="M667 75 L674 82 L688 64" stroke="var(--bone)" strokeWidth={2.5} fill="none" vectorEffect="non-scaling-stroke" />

      {/* Settled: the last stamp, in moss. */}
      <g className="illu-pop" style={step(1)}>
        <circle cx={872} cy={74} r={25} fill="var(--surface-raised)" stroke="var(--moss)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
        <circle cx={872} cy={74} r={17} stroke="var(--moss)" strokeWidth={1.5} opacity={0.55} fill="none" vectorEffect="non-scaling-stroke" />
        <path d="M864 77 L871 84 L882 70" stroke="var(--moss)" strokeWidth={2.5} fill="none" vectorEffect="non-scaling-stroke" />
      </g>

      {/* The wax, struck once on the final stamp. */}
      <g className="illu-pop" style={step(2)}>
        <circle cx={890} cy={54} r={8} fill="var(--accent)" stroke="none" />
        <circle
          cx={890}
          cy={54}
          r={4.5}
          stroke="var(--accent-ink)"
          strokeWidth={1.5}
          opacity={0.5}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        <path d="M885 60 L882 68 M895 60 L898 68" stroke="var(--accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </g>

      {/* The five stages, named along the rail. */}
      <text x={88} y={116} textAnchor="middle" fontSize={13} letterSpacing={1} fill="var(--faint)" stroke="none">
        opened
      </text>
      <text x={284} y={116} textAnchor="middle" fontSize={13} letterSpacing={1} fill="var(--faint)" stroke="none">
        funded
      </text>
      <text x={480} y={116} textAnchor="middle" fontSize={13} letterSpacing={1} fill="var(--faint)" stroke="none">
        delivered
      </text>
      <text x={676} y={116} textAnchor="middle" fontSize={13} letterSpacing={1} fill="var(--faint)" stroke="none">
        verified
      </text>
      <text x={872} y={116} textAnchor="middle" fontSize={13} letterSpacing={1} fill="var(--faint)" stroke="none">
        settled
      </text>

      {/* A dotted rule closes the rail, like the foot of a ledger page. */}
      <path
        d="M64 132 H896"
        stroke="var(--hairline)"
        strokeWidth={1.5}
        strokeDasharray="1 8"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

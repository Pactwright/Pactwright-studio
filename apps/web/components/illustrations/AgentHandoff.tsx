import type { CSSProperties } from "react";

/** Reveal stagger shared by every illustration; see illustrations.css. */
const step = (i: number) => ({ "--i": i } as CSSProperties);

/**
 * An AI agent (a terminal, no face) hands a pact to the escrow contract (a box
 * with a keyhole and a wax seal). The dotted rule is the request; the coins on
 * the lower dotted rule are the money that follows it into escrow.
 *
 * Animatable: the prompt caret (draw), the contract outline (draw), the wax seal (pop).
 */
export function AgentHandoff({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      className={`illu illu--agent-handoff ${className ?? ""}`}
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
      {/* The agent: a terminal, drawn as a window, never as a face. */}
      <rect x={36} y={76} width={156} height={112} rx={12} fill="var(--surface)" stroke="none" />
      <rect
        x={36}
        y={76}
        width={156}
        height={112}
        rx={12}
        stroke="var(--bone)"
        strokeWidth={2}
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
      <path d="M36 106 H192" stroke="var(--hairline-strong)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <circle cx={52} cy={91} r={2.5} stroke="var(--hairline-strong)" strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
      <circle cx={64} cy={91} r={2.5} stroke="var(--hairline-strong)" strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
      <circle cx={76} cy={91} r={2.5} stroke="var(--hairline-strong)" strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />

      {/* The prompt: a vermilion caret and the block cursor behind it. */}
      <path
        className="illu-draw"
        style={step(0)}
        pathLength={1}
        d="M58 132 L70 144 L58 156"
        stroke="var(--accent)"
        strokeWidth={2.5}
        vectorEffect="non-scaling-stroke"
      />
      <rect x={76} y={130} width={3} height={28} fill="var(--accent)" stroke="none" />
      <path d="M88 136 H172" stroke="var(--bone)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <path d="M88 152 H144" stroke="var(--hairline-strong)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />

      {/* Log lines under the prompt, dotted like a running ledger. */}
      <path
        d="M52 176 H132"
        stroke="var(--hairline-strong)"
        strokeWidth={1.5}
        strokeDasharray="1 6"
        vectorEffect="non-scaling-stroke"
      />
      <path d="M52 184 H96" stroke="var(--hairline-strong)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />

      {/* The request, crossing to the contract. */}
      <path
        d="M192 138 C 226 138, 252 142, 292 146"
        stroke="var(--bone)"
        strokeWidth={1.5}
        strokeDasharray="1 6"
        vectorEffect="non-scaling-stroke"
      />
      <path d="M284 140 L294 146 L285 152" stroke="var(--bone)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />

      {/* The contract: a rounded box with a keyhole. */}
      <rect x={300} y={64} width={144} height={168} rx={14} fill="var(--surface-raised)" stroke="none" />
      <rect
        className="illu-draw"
        style={step(1)}
        pathLength={1}
        x={300}
        y={64}
        width={144}
        height={168}
        rx={14}
        stroke="var(--bone)"
        strokeWidth={2}
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
      <path d="M310 96 H434" stroke="var(--hairline-strong)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />

      {/* Keyhole: the escrow can only be opened by the two deadlines. */}
      <circle cx={372} cy={136} r={11} stroke="var(--bone)" strokeWidth={2} fill="none" vectorEffect="non-scaling-stroke" />
      <path
        d="M366 145 L362 168 H382 L378 145"
        stroke="var(--bone)"
        strokeWidth={2}
        fill="none"
        strokeLinejoin="miter"
        vectorEffect="non-scaling-stroke"
      />

      {/* The vault slot, hatched so it reads as an opening. */}
      <rect x={330} y={206} width={84} height={12} rx={6} fill="var(--surface)" stroke="var(--hairline-strong)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <path
        d="M340 218 L350 206 M354 218 L364 206 M368 218 L378 206"
        stroke="var(--hairline-strong)"
        strokeWidth={1.5}
        opacity={0.7}
        vectorEffect="non-scaling-stroke"
      />

      {/* The money follows the request into escrow. */}
      <path
        d="M112 190 C 160 234, 232 242, 322 212"
        stroke="var(--bone)"
        strokeWidth={1.5}
        strokeDasharray="1 6"
        vectorEffect="non-scaling-stroke"
      />
      <path d="M312 205 L322 212 L313 219" stroke="var(--bone)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <circle cx={161} cy={219} r={10} fill="var(--surface)" stroke="var(--bone)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <circle cx={161} cy={219} r={5.5} stroke="var(--hairline-strong)" strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
      <circle cx={222} cy={230} r={10} fill="var(--surface)" stroke="var(--bone)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <circle cx={222} cy={230} r={5.5} stroke="var(--hairline-strong)" strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
      <circle cx={283} cy={223} r={10} fill="var(--surface)" stroke="var(--bone)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <circle cx={283} cy={223} r={5.5} stroke="var(--hairline-strong)" strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />

      {/* The wax seal on the contract, struck over the corner. */}
      <g className="illu-pop" style={step(2)}>
        <circle cx={444} cy={76} r={11} fill="var(--accent)" stroke="none" />
        <circle
          cx={444}
          cy={76}
          r={6.5}
          stroke="var(--accent-ink)"
          strokeWidth={1.5}
          opacity={0.5}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        <path d="M438 84 L434 92 M450 84 L454 92" stroke="var(--accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}

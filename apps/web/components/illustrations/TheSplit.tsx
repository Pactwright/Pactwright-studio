import type { CSSProperties } from "react";

/** Reveal stagger shared by every illustration; see illustrations.css. */
const step = (i: number) => ({ "--i": i } as CSSProperties);

/**
 * Settlement: one amount comes in at the top, then the ledger elbow sends it
 * two ways — moss to the seller, rust back to the buyer. The proportional bar
 * repeats the same split as a quantity, so the picture is not colour-only.
 *
 * Animatable: the elbow connector (draw), the seller disc (pop), the buyer disc (pop).
 */
export function TheSplit({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      className={`illu illu--the-split ${className ?? ""}`}
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
      {/* The incoming amount, entering from above. */}
      <path
        d="M240 10 V24"
        stroke="var(--hairline-strong)"
        strokeWidth={1.5}
        strokeDasharray="1 5"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={240} cy={58} r={32} fill="var(--surface-raised)" stroke="var(--bone)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <circle cx={240} cy={58} r={22} stroke="var(--hairline-strong)" strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
      <circle cx={240} cy={58} r={3} fill="var(--bone)" stroke="none" />

      {/* The ledger elbow: one stem, two right-angled branches. */}
      <path
        className="illu-draw"
        style={step(0)}
        pathLength={1}
        d="M240 90 V132 M240 132 H136 V160 M240 132 H344 V160"
        stroke="var(--bone)"
        strokeWidth={1.5}
        strokeLinejoin="miter"
        vectorEffect="non-scaling-stroke"
      />

      {/* To the seller, stamped moss. */}
      <g className="illu-pop" style={step(1)}>
        <circle cx={136} cy={196} r={36} fill="var(--green-subtle)" stroke="var(--moss)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <circle cx={136} cy={196} r={26} stroke="var(--moss)" strokeWidth={1.5} opacity={0.55} fill="none" vectorEffect="non-scaling-stroke" />
        <path
          d="M124 196 L133 205 L150 185"
          stroke="var(--moss)"
          strokeWidth={2.5}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      </g>

      {/* Back to the buyer, stamped rust. */}
      <g className="illu-pop" style={step(2)}>
        <circle cx={344} cy={196} r={36} fill="var(--rose-subtle)" stroke="var(--rust)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <circle cx={344} cy={196} r={26} stroke="var(--rust)" strokeWidth={1.5} opacity={0.55} fill="none" vectorEffect="non-scaling-stroke" />
        <path
          d="M330 196 H354 M345 187 L354 196 L345 205"
          stroke="var(--rust)"
          strokeWidth={2.5}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      </g>

      {/* The two destinations, named in faint ink. */}
      <text x={136} y={252} textAnchor="middle" fontSize={13} letterSpacing={1} fill="var(--faint)" stroke="none">
        to seller
      </text>
      <text x={344} y={252} textAnchor="middle" fontSize={13} letterSpacing={1} fill="var(--faint)" stroke="none">
        to buyer
      </text>

      {/* A dotted rule separates the branches from the measure. */}
      <path
        d="M136 266 H344"
        stroke="var(--hairline-strong)"
        strokeWidth={1.5}
        strokeDasharray="1 7"
        vectorEffect="non-scaling-stroke"
      />

      {/* The split, to scale: 129 of 208 to the seller, 79 to the buyer. */}
      <rect x={136} y={280} width={129} height={14} fill="var(--green-subtle)" stroke="var(--moss)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <rect x={265} y={280} width={79} height={14} fill="var(--rose-subtle)" stroke="var(--rust)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <path d="M265 276 V298" stroke="var(--bone)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />

      {/* Hatch in the refunded part: engraver's shorthand for "the remainder". */}
      <path
        d="M274 294 L286 280 M290 294 L302 280 M306 294 L318 280 M322 294 L334 280"
        stroke="var(--rust)"
        strokeWidth={1.5}
        opacity={0.45}
        vectorEffect="non-scaling-stroke"
      />

      {/* A ruler under the bar: both ends, and the split. */}
      <path
        d="M136 300 V306 M265 300 V306 M344 300 V306"
        stroke="var(--hairline-strong)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

import type { CSSProperties } from "react";

/** Reveal stagger shared by every illustration; see illustrations.css. */
const step = (i: number) => ({ "--i": i } as CSSProperties);

/**
 * A delivery receipt: a certificate leaf with five key/value rows, a brass
 * leaf-and-tick stamp, and the Merkle tree its hash climbs — seven nodes, three
 * levels, one vermilion root.
 *
 * Animatable: the certificate outline (draw), the Merkle edges (draw), the root (pop).
 */
export function ReceiptLeaf({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      className={`illu illu--receipt-leaf ${className ?? ""}`}
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
      {/* The leaf of the register: certificate paper, opaque. */}
      <rect x={40} y={32} width={252} height={256} fill="var(--surface)" stroke="none" />

      {/* The certificate, drawn around. */}
      <path
        className="illu-draw"
        style={step(0)}
        pathLength={1}
        d="M40 32 H292 V288 H40 Z"
        stroke="var(--bone)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />

      {/* A dotted inner margin. */}
      <path
        d="M52 44 H280 V276 H52 Z"
        stroke="var(--hairline-strong)"
        strokeWidth={1.5}
        strokeDasharray="1 6"
        vectorEffect="non-scaling-stroke"
      />

      {/* Header: a solid rule, then a dotted one, like a ruled form. */}
      <path d="M60 58 H272" stroke="var(--bone)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      <path
        d="M60 68 H272"
        stroke="var(--hairline-strong)"
        strokeWidth={1.5}
        strokeDasharray="1 5"
        vectorEffect="non-scaling-stroke"
      />

      {/* Five key/value rows on a 24 px mono rhythm; keys short, values long. */}
      <path
        d="M60 96 H104 M60 120 H96 M60 144 H110 M60 168 H92 M60 192 H104"
        stroke="var(--hairline-strong)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M116 96 H252 M116 120 H268 M116 144 H240 M116 168 H256 M116 192 H232"
        stroke="var(--bone)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />

      {/* The brass leaf and tick: what a certificate leaf is stamped with. */}
      <path
        d="M66 246 C 62 228, 74 214, 92 214 C 92 232, 82 246, 66 246 Z"
        stroke="var(--brass)"
        strokeWidth={1.5}
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M68 244 C 76 236, 84 228, 90 218"
        stroke="var(--brass)"
        strokeWidth={1.5}
        opacity={0.7}
        vectorEffect="non-scaling-stroke"
      />
      <path d="M100 232 L106 238 L118 224" stroke="var(--brass)" strokeWidth={2} vectorEffect="non-scaling-stroke" />

      {/* The certified rule, solid over dotted. */}
      <path d="M60 262 H196" stroke="var(--hairline-strong)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <path
        d="M60 268 H196"
        stroke="var(--hairline-strong)"
        strokeWidth={1.5}
        strokeDasharray="1 5"
        vectorEffect="non-scaling-stroke"
      />

      {/* The receipt hash leaves the certificate… */}
      <path
        d="M292 236 H304"
        stroke="var(--hairline-strong)"
        strokeWidth={1.5}
        strokeDasharray="1 4"
        vectorEffect="non-scaling-stroke"
      />

      {/* …and climbs: four leaves, two hashes, one root. */}
      <path
        className="illu-draw"
        style={step(1)}
        pathLength={1}
        d="M380 75 L334 132 M380 75 L426 132 M334 148 L310 230 M334 148 L358 230 M426 148 L402 230 M426 148 L450 230"
        stroke="var(--hairline-strong)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />

      {/* The four leaf hashes, as sealed squares. */}
      <rect x={304} y={230} width={12} height={12} fill="var(--surface-raised)" stroke="var(--bone)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <rect x={352} y={230} width={12} height={12} fill="var(--surface-raised)" stroke="var(--bone)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <rect x={396} y={230} width={12} height={12} fill="var(--surface-raised)" stroke="var(--bone)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <rect x={444} y={230} width={12} height={12} fill="var(--surface-raised)" stroke="var(--bone)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />

      {/* The two branch hashes. */}
      <circle cx={334} cy={140} r={8} fill="var(--surface-raised)" stroke="var(--bone)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <circle cx={426} cy={140} r={8} fill="var(--surface-raised)" stroke="var(--bone)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />

      {/* The root, ringed vermilion: the one hash anchored on-chain. */}
      <g className="illu-pop" style={step(2)}>
        <circle cx={380} cy={64} r={11} fill="var(--surface-raised)" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <circle cx={380} cy={64} r={4} fill="var(--accent)" stroke="none" />
      </g>
      <path
        d="M380 30 V53"
        stroke="var(--hairline-strong)"
        strokeWidth={1.5}
        strokeDasharray="1 5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

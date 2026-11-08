import type { CSSProperties } from "react";

/**
 * Reveal stagger. Every moving part carries `--i` so `illustrations.css` can
 * delay it behind the part before it. Pure data: no client JavaScript needed.
 */
const step = (i: number) => ({ "--i": i } as CSSProperties);

/**
 * A pact: one ruled document, one wax seal struck over its lower corner, one
 * ribbon. The seal is vermilion and carries the "P" of the register. Line art
 * only — paper is `--surface`, ink is `--bone`, wax is `--accent`.
 *
 * Animatable: the page outline (draw), the ruled body (draw), the seal (pop).
 */
export function SealedPact({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      className={`illu illu--sealed-pact ${className ?? ""}`}
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
      {/* The sheet, opaque, so nothing behind it shows through the paper. */}
      <rect x={146} y={24} width={184} height={248} fill="var(--surface)" stroke="none" />

      {/* A dotted ledger margin, struck just inside the sheet edge. */}
      <path
        d="M158 36 H318 V260 H158 Z"
        stroke="var(--hairline-strong)"
        strokeWidth={1.5}
        strokeDasharray="1 6"
        vectorEffect="non-scaling-stroke"
      />

      {/* A crosshatch docket block in the top corner: engraved strokes, both ways. */}
      <path
        d="M282 70 L308 44 M290 70 L316 44 M302 70 L316 56 M282 44 L308 70 M290 44 L316 70 M302 44 L316 58"
        stroke="var(--hairline)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />

      {/* The page, drawn once around. */}
      <path
        className="illu-draw"
        style={step(0)}
        pathLength={1}
        d="M146 24 H330 V272 H146 Z"
        stroke="var(--bone)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />

      {/* Docket header, then the one vermilion rule that marks the amount line. */}
      <path d="M170 88 H306" stroke="var(--bone)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <path d="M170 98 H236" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />

      {/* The terms: five ruled lines, one rhythm, last line short. */}
      <path
        className="illu-draw"
        style={step(1)}
        pathLength={1}
        d="M170 124 H306 M170 148 H306 M170 172 H288 M170 196 H306 M170 220 H270"
        stroke="var(--hairline-strong)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />

      {/* The signature rule, before the wax. */}
      <path d="M170 246 H246" stroke="var(--bone)" strokeWidth={2} vectorEffect="non-scaling-stroke" />

      {/* The ribbon, tied behind the wax; both tops are hidden by the seal. */}
      <path
        d="M296 262 L282 310 L297 303 L306 314 L315 268 Z"
        fill="var(--accent-subtle)"
        stroke="var(--accent)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M336 268 L348 312 L335 305 L327 316 L318 264 Z"
        fill="var(--accent-subtle)"
        stroke="var(--accent)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />

      {/* The wax, struck once over the corner, with the P pressed into it. */}
      <g className="illu-pop" style={step(2)}>
        <circle cx={330} cy={230} r={54} fill="var(--accent)" stroke="none" />
        <circle
          cx={330}
          cy={230}
          r={44}
          stroke="var(--text-strong)"
          strokeWidth={1.5}
          opacity={0.45}
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={330}
          cy={230}
          r={35}
          stroke="var(--accent-ink)"
          strokeWidth={1.5}
          strokeDasharray="1 5"
          opacity={0.55}
          vectorEffect="non-scaling-stroke"
        />
        <text
          x={330}
          y={245}
          textAnchor="middle"
          fontSize={44}
          fontWeight={600}
          fill="var(--accent-ink)"
          stroke="none"
        >
          P
        </text>
      </g>
    </svg>
  );
}

import { useId } from "react";

/** The serrated edge of a notary seal, 36 points in a 100×100 box. */
const EDGE =
  "M50.00 1.00 L53.88 5.67 L58.51 1.74 L61.52 7.02 L66.76 3.96 L68.81 9.67 L74.50 7.56 L75.52 13.55 L81.50 12.46 L81.47 18.53 L87.54 18.50 L86.45 24.48 L92.44 25.50 L90.33 31.19 L96.04 33.24 L92.98 38.48 L98.26 41.49 L94.33 46.12 L99.00 50.00 L94.33 53.88 L98.26 58.51 L92.98 61.52 L96.04 66.76 L90.33 68.81 L92.44 74.50 L86.45 75.52 L87.54 81.50 L81.47 81.47 L81.50 87.54 L75.52 86.45 L74.50 92.44 L68.81 90.33 L66.76 96.04 L61.52 92.98 L58.51 98.26 L53.88 94.33 L50.00 99.00 L46.12 94.33 L41.49 98.26 L38.48 92.98 L33.24 96.04 L31.19 90.33 L25.50 92.44 L24.48 86.45 L18.50 87.54 L18.53 81.47 L12.46 81.50 L13.55 75.52 L7.56 74.50 L9.67 68.81 L3.96 66.76 L7.02 61.52 L1.74 58.51 L5.67 53.88 L1.00 50.00 L5.67 46.12 L1.74 41.49 L7.02 38.48 L3.96 33.24 L9.67 31.19 L7.56 25.50 L13.55 24.48 L12.46 18.50 L18.53 18.53 L18.50 12.46 L24.48 13.55 L25.50 7.56 L31.19 9.67 L33.24 3.96 L38.48 7.02 L41.49 1.74 L46.12 5.67 Z";

/**
 * The Pactwright mark (two interlocking links closed by a check), from the brand SVG scaled 0.6 about
 * the seal's centre. `back` is the link behind, `front` the link in front and the check.
 */
function Mark({ back, front }: { back: string; front: string }) {
  return (
    <g fill="none" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="32" y="38" width="24" height="24" rx="7.2" stroke={back} />
      <rect x="44" y="38" width="24" height="24" rx="7.2" stroke={front} />
      <path d="M40.4 50.6 l6 6 l13.2 -14.4" stroke={front} />
    </g>
  );
}

/**
 * The brand mark as a holographic foil seal: the foil gradient, with an iridescent sheen laid over it
 * in CSS (`.seal::after`). `pressed` plays the stamping motion once, used when a certificate checks out.
 */
export function Seal({ size = 96, pressed = false, label = "Pactwright seal" }: { size?: number; pressed?: boolean; label?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <span
      className={`seal${pressed ? " seal--pressed" : ""}`}
      style={{ width: size, height: size }}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id={`foil-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2DD4BF" />
            <stop offset="0.48" stopColor="#4FA6D8" />
            <stop offset="1" stopColor="#6366F1" />
          </linearGradient>
          <linearGradient id={`sheen-${id}`} x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="0.35" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.7" stopColor="#0B1736" stopOpacity="0" />
            <stop offset="1" stopColor="#0B1736" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        <path d={EDGE} fill={`url(#foil-${id})`} />
        <path d={EDGE} fill={`url(#sheen-${id})`} />
        <circle cx="50" cy="50" r="37" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="1" />
        <circle cx="50" cy="50" r="34.5" fill="none" stroke="#0B1736" strokeOpacity="0.3" strokeWidth="1" />
        {/* Embossing: the mark's impression, offset down-right beneath it. */}
        <g transform="translate(0.8 0.9)">
          <Mark back="rgba(11,23,54,0.35)" front="rgba(11,23,54,0.35)" />
        </g>
        <Mark back="#0B1736" front="#F8FAFC" />
      </svg>
    </span>
  );
}

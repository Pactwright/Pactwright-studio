# Illustrations

Six hand-drawn SVG diagrams that explain Pactwright Studio without a screenshot:
a pact, its two deadlines, the split at settlement, a delivery receipt, the
process rail, and an agent handing money into escrow. They are line drawings —
ruled lines, stamped circles, dotted rules, crosshatch — not cartoons. No faces,
no 3D, no shadows, no glow, no gradients.

Everything is a plain function component: no state, no effects, no client
bundle. Colour comes from the `:root` tokens in `app/globals.css` and from
nothing else, so the set follows the brand without a second palette.

## Usage

```tsx
import { SealedPact, StageRail } from "@/components/illustrations";

<SealedPact className="pact-figure" title="A pact sealed before funding" />
<StageRail title="Opened, funded, delivered, verified, settled" />
```

| Prop        | Type     | Meaning                                                                 |
| ----------- | -------- | ----------------------------------------------------------------------- |
| `className` | `string` | Appended after the component's own classes (`illu illu--sealed-pact …`). |
| `title`     | `string` | Accessible name. When set the SVG is `role="img"` with `aria-label`.    |

With no `title` the drawing is decorative: `aria-hidden="true"` and
`focusable="false"`. Always pass `title` when the drawing is the only thing
explaining a point on the page.

## Motion

`app/illustrations.css` is imported once, in `app/layout.tsx`. It defines two
moves and nothing else:

- `.illu-draw` — a pen stroke. Every animatable path carries `pathLength={1}`,
  which renormalises the path to length 1, so `stroke-dasharray: 1` with
  `stroke-dashoffset: 1 → 0` draws it whatever its real length. No measured
  dash lengths in the components.
- `.illu-pop` — a stamp. Scales from `0.86` to `1` and fades from `0` to `1`,
  `0.6s`, after the stroke it sits on.

Both are triggered by the existing scroll observer
(`components/ScrollReveal.tsx`), which puts `js-ready` on `<html>` and
`is-visible` on each `.scroll-reveal` section:

```css
html.js-ready .scroll-reveal.is-visible .illu-draw { animation: illu-draw 1.1s …; }
```

Stagger comes from a `--i` custom property set inline on each moving part
(`animation-delay: calc(var(--i) * 140ms)` for strokes, `420ms + …` for stamps).

Three guarantees worth keeping:

1. **No JavaScript, no hiding.** The hidden state only applies inside
   `.scroll-reveal`. An illustration outside a reveal container renders
   finished, and an unrevealed one is still one class toggle from visible.
2. **Reduced motion is final-state, not no-state.** Under
   `prefers-reduced-motion: reduce` every animation is off *and* every moving
   part is pinned to `stroke-dashoffset: 0`, `opacity: 1`, `transform: none`.
   The block is explicit for that reason.
3. **Hover is colour only.** `.illu:hover .illu-draw` warms drawn strokes to
   `--accent` over `0.2s`. Nothing moves and nothing reflows. Semantic strokes
   (moss, rust, brass) warm too: the treatment belongs to the illustration, not
   to the pact's state.

## The set

All six are `viewBox="0 0 480 320"` except `StageRail`, which is
`960 × 160` so it can run full width.

### SealedPact

One ruled document, a crosshatch docket block, a vermilion wax seal struck over
the lower corner with a pressed "P", and two ribbon tails tied behind it.
Tokens: `--surface` paper, `--bone` ink, `--accent` wax, `--accent-ink` P.

Animatable: page outline `.illu-draw` (`--i: 0`), ruled body `.illu-draw`
(`--i: 1`), seal group `.illu-pop` (`--i: 2`).

### TwoDeadlines

A rail with two brass deadline ticks — verdict nearer, settle further — a filled
verdict stamp and a hollow settle stamp, the accent-subtle window between them,
and a clock arc with ticks and a hand between the two gates. Labels `verdict`
and `settle` are 10 px `--faint` text in the inherited font.

Animatable: rail `.illu-draw` (`--i: 0`), both ticks + caps `.illu-draw`
(`--i: 1`), clock arc + ticks + hand `.illu-draw` (`--i: 2`). No pops: this one
is pure drafting.

### TheSplit

An incoming amount disc at the top, a ledger elbow (sharp right angles) sending
it to a moss seller disc and a rust buyer disc, a dotted rule, and a
proportional bar — 129 of 208 to the seller, 79 to the buyer, hatched in the
refunded part. The bar repeats the split as a quantity, so the meaning is not
colour-only.

Animatable: elbow `.illu-draw` (`--i: 0`), seller disc group `.illu-pop`
(`--i: 1`), buyer disc group `.illu-pop` (`--i: 2`).

### ReceiptLeaf

A certificate leaf: header rule and dotted rule, five key/value rows on a 24 px
mono rhythm, a brass leaf-and-tick stamp, and the Merkle tree the receipt hash
climbs — seven nodes across three levels, four square leaves, two branch hashes,
one vermilion root.

Animatable: certificate outline `.illu-draw` (`--i: 0`), Merkle edges
`.illu-draw` (`--i: 1`), root `.illu-pop` (`--i: 2`).

### StageRail

Five stamped nodes on one rail: opened (an open gate), funded (a coin), delivered
(an arrow landing on a tray), verified (a check), settled (the same check in
moss) with a small vermilion seal struck on the final stamp. Stage names sit
under the stamps in 10 px `--faint`.

Animatable: rail `.illu-draw` (`--i: 0`), settled stamp `.illu-pop` (`--i: 1`),
wax seal `.illu-pop` (`--i: 2`).

### AgentHandoff

The agent as a terminal window — title bar, three dots, a vermilion `>` caret
and block cursor, log rules beneath. A dotted rule carries the request to the
contract: a rounded box with a keyhole and a hatched vault slot, sealed at the
corner. A second dotted rule carries three coin discs into the slot. No robot
face anywhere.

Animatable: prompt caret `.illu-draw` (`--i: 0`), contract outline `.illu-draw`
(`--i: 1`), wax seal `.illu-pop` (`--i: 2`).

## Rules for editing these files

- Colour: `var(--…)` only. No hex, no `rgb()`, no `hsl()`, no `currentColor` for
  accent, and no gradient function or `<linearGradient>` / `<radialGradient>`.
  The brand guard (`scripts/check-brand.mjs`) enforces this.
- Strokes: 1.5–2.5, round caps, `vectorEffect="non-scaling-stroke"` on geometry
  so nothing thickens when the SVG scales.
- Fills: only `--surface`, `--surface-raised`, `--accent-subtle`,
  `--green-subtle`, `--rose-subtle`. Everything else is a line.
- Dotted rules use `strokeDasharray` (typically `1 5` … `1 8`). A dotted path
  must never also carry `.illu-draw`: `stroke-dasharray: 1` from the reveal CSS
  would replace the dots with one solid dash. Draw-animate solid strokes only.
- Two or three moving parts per drawing, no more. A moving part is a marked
  element, not a decoration.

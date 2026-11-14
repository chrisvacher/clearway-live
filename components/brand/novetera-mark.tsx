import type { WordmarkSize } from "./live-wordmark";
import "./novetera-brand.css";
// The Novetera N mark: two strokes, drawn from the design system's mark files (mark-charcoal, mark-chalk, mark-oxblood and
// their stone variants are one shape in different colours; the shape is the 1000 x 1000 polygons below). Colours come from the
// cwl-mark tokens in design/novetera-live/novetera_tokens.css, so the mark follows the theme of the data-skin="novetera" root
// it sits in. The second stroke turns oxblood while the room is live (Oxblood 700 on light; the chalk mark with Oxblood 300 on
// dark). Not live: the chalk and stone mark on dark, the charcoal mark on light. Offline: Slate 400, breathing on the existing
// reconnect motion tokens (steady under reduced motion). tone="join" is for the TV join screen's own ground.
// The height is a lockup height token (--cwl-wordmark-h-*); the mark is square. Never type "Novetera" beside the lockup.
const FIRST = "172,99 615,359 615,508 294,320 294,865 172,865";
const SECOND = "828,901 385,641 385,492 706,680 706,135 828,135";
export function NoveteraMark({ live = false, offline = false, size = "app", tone = "theme", label = "Novetera" }: { live?: boolean; offline?: boolean; size?: WordmarkSize; tone?: "theme" | "join"; label?: string | null }) {
  return <span className={`nvt-mark is-${size}${offline ? " is-offline" : live ? " is-live" : ""}${tone === "join" ? " is-join" : ""}`} {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
    <svg viewBox="0 0 1000 1000" aria-hidden="true" focusable="false"><polygon className="a" points={FIRST} /><polygon className="b" points={SECOND} /></svg>
  </span>;
}

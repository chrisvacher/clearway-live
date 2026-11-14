import type { WordmarkSize } from "./live-wordmark";
import "./novetera-brand.css";
// The full Novetera lockup for the join screen and emails: the N mark, then NOVETERA in Public Sans 800, uppercase, 0.015em
// tracking, the gap half the mark's width and the type centred on the mark, as the design system's wordmark card and the
// canvas draw it. The design system ships the lockup as live text, so the letters here are the Public Sans ExtraBold outlines
// (SIL Open Font Licence, public/fonts/novetera) set at those metrics and drawn as a path: exact at any size, and no font has
// to load for the join screen to look right. Colours come from the cwl-wordmark tokens, as the Clearway lockup's do: light on
// Chalk and white, dark on Charcoal, or tone="join" for the join screen's own ground (cwl-text-holding, cwl-mark-holding).
// The height is the mark's height (a --cwl-wordmark-h-* token).
const FIRST = "172,99 615,359 615,508 294,320 294,865 172,865";
const SECOND = "828,901 385,641 385,492 706,680 706,135 828,135";
const WORD = "M1558.1 784.8V216.8H1692.1L1932.5 563.2V216.8H2066.1V784.8H1945.5L1692.1 420.3V784.8ZM2440.9 792.7Q2358.4 792.7 2298.1 757.3Q2237.8 722 2204.8 656.8Q2171.8 591.5 2171.8 502Q2171.8 412 2205.4 346.4Q2239 280.8 2299.3 244.8Q2359.6 208.9 2440.9 208.9Q2521.8 208.9 2581.7 244.6Q2641.6 280.4 2674.8 346.2Q2708 412 2708 502Q2708 591.1 2675.4 656.4Q2642.8 721.6 2582.7 757.1Q2522.6 792.7 2440.9 792.7ZM2440.9 684.3Q2495.5 684.3 2529.1 643Q2562.7 601.8 2562.7 503.9Q2562.7 403.4 2529.1 360.3Q2495.5 317.3 2440.9 317.3Q2386.3 317.3 2352.3 360.3Q2318.3 403.4 2318.3 503.9Q2318.3 602.1 2352.3 643.2Q2386.3 684.3 2440.9 684.3ZM2963 784.8 2768.9 216.8H2895.8L3037.6 628.9L3179.1 216.8H3306.4L3111.9 784.8ZM3389.6 784.8V216.8H3794.7L3793.9 328.3H3524.4V444.2H3754.2V553.4H3523.6V672.1L3797 672.5V784.8ZM4026.5 784.8V335H3860.3V216.8H4325.8V335H4160.8V784.8ZM4409.1 784.8V216.8H4814.1L4813.4 328.3H4543.9V444.2H4773.7V553.4H4543.1V672.1L4816.5 672.5V784.8ZM4924.5 784.8V216.8H5173.2Q5244.3 216.8 5288.3 239.7Q5332.3 262.7 5352.8 302.6Q5373.2 342.5 5373.2 393.1Q5373.2 459.5 5345.7 496.7Q5318.2 533.8 5278.5 555.8L5381 784.8H5243.5L5155.9 577.4H5058.5V784.8ZM5058.5 476.4H5154.8Q5192.5 476.4 5215.4 452.7Q5238.4 428.9 5238.4 395.5Q5238.4 360.9 5214.9 338.9Q5191.3 316.9 5158.7 316.9H5058.5ZM5448.6 784.8 5650.5 216.8H5789.2L5991.5 784.8H5858.8L5816.7 663.8H5625L5582.2 784.8ZM5654.1 548.7H5785.7L5720.1 345.2Z";
export function NoveteraLockup({ theme, size = "page", tone = "theme", label = "Novetera" }: { theme?: "light" | "dark"; size?: WordmarkSize; tone?: "theme" | "join"; label?: string | null }) {
  return <span className={`nvt-lockup${theme ? ` is-${theme}` : ""} is-${size}${tone === "join" ? " is-join" : ""}`} {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
    <svg viewBox="0 0 6008 1000" aria-hidden="true" focusable="false"><polygon className="a" points={FIRST} /><polygon className="b" points={SECOND} /><path className="w" d={WORD} /></svg>
  </span>;
}

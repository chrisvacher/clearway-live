import type { SVGProps } from "react";
import { lensName, type LensNumber } from "@/lib/wayfinding/lens";

// The five lens icons (design pass 4, assets/Icons). Drawn on the 24px grid with a 2px round
// stroke in currentColor, so the color comes from the heading or chip that holds it.
const drawings: Record<LensNumber, React.ReactNode> = {
  1: <><circle cx="12" cy="7" r="3"/><path d="M6.5 20v-1.5a5.5 5.5 0 0 1 11 0V20"/><circle cx="4.5" cy="10" r="2"/><path d="M1.5 19v-.75A3.25 3.25 0 0 1 4.75 15"/><circle cx="19.5" cy="10" r="2"/><path d="M22.5 19v-.75A3.25 3.25 0 0 0 19.25 15"/></>,
  2: <><path d="M2 21h20"/><path d="M4 21V11.5L9.5 7l5.5 4.5V21"/><path d="M8 21v-4.5h3V21"/><path d="M15 21v-6.5l3-2.5 3 2.5V21"/></>,
  3: <><path d="M2.5 21 9 11l3.5 4.5L15 12l6.5 9Z"/><path d="M9 11V3"/><path d="M9 3.5h6l-1.75 2.25L15 8H9"/></>,
  4: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><circle cx="17.5" cy="6.5" r="3.5"/><path d="M10 6.5h4"/><path d="M6.5 10v4a3.5 3.5 0 0 0 3.5 3.5h4"/></>,
  5: <><path d="M2 8.5c3.2-1.2 6.6-.9 10 1.2 3.4-2.1 6.8-2.4 10-1.2v11c-3.2-1.2-6.6-.9-10 1.2-3.4-2.1-6.8-2.4-10-1.2Z"/><path d="M12 9.7v11"/><path d="M12 7.5c0-2.6 1.6-4.5 4.5-4.5 0 2.6-1.7 4.5-4.5 4.5Z"/><path d="M12 7.5C12 5.6 10.8 4.2 8.6 4.2c0 1.9 1.3 3.3 3.4 3.3Z"/></>,
};
export function LensIcon({ lens, size = 24, ...rest }: { lens: LensNumber; size?: number } & Omit<SVGProps<SVGSVGElement>, "width" | "height">) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>{drawings[lens]}</svg>;
}

// The lens heading: one color for every lens, the icon and the engagement's name for the lens.
// "tv" is the 20px-and-larger fill with its on-lens text; "small" is the chip for phones, the
// remote and the control surface.
export function LensHeading({ lens, names, size = "tv" }: { lens: LensNumber; names?: readonly string[] | null; size?: "tv" | "small" }) {
  const name = lensName(lens, names);
  return <span className={size === "tv" ? "lens-heading" : "lens-chip"}><LensIcon lens={lens} size={size === "tv" ? 40 : 16} /><span>{name}</span></span>;
}

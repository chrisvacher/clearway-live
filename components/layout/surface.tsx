import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { phoneTheme } from "@/lib/brand/screens";
import type { Skin } from "@/lib/brand";

// `skin` is for room-facing phone pages: the skin sets the root's data-skin, and a Novetera phone draws in its theme (phoneTheme,
// Chalk by default) in place of the `theme` the caller names. Facilitator screens pass no skin and are unchanged.
export function Surface({ children, surface, theme, skin }: {
  children: ReactNode;
  surface: "control" | "phone";
  theme: "light" | "dark";
  skin?: Skin;
}) {
  const novetera = skin === "novetera";
  return <div className="surface" data-surface={surface} {...(skin ? { "data-skin": skin } : {})} data-theme={novetera ? phoneTheme.novetera : theme}
    {...(surface === "phone" ? { "data-screen": "phone-answering" } : {})}>
    <a className="skip-link button-link" href="#main">Skip to content</a>
    <SiteHeader skin={skin} />
    {children}
  </div>;
}

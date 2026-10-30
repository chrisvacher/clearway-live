import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";

export function Surface({ children, surface, theme }: {
  children: ReactNode;
  surface: "control" | "phone";
  theme: "light" | "dark";
}) {
  return <div className="surface" data-surface={surface} data-theme={theme}
    {...(surface === "phone" ? { "data-screen": "phone-answering" } : {})}>
    <a className="skip-link button-link" href="#main">Skip to content</a>
    <SiteHeader />
    {children}
  </div>;
}

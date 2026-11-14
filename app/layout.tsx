import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { screenMetadata } from "@/lib/brand/metadata";
import { addressSkin } from "@/lib/brand/request";
import "./globals.css";

// The default title, description and icons follow the address (live.novetera.co is Novetera; every other address is Clearway Live, as before),
// so a page that sets none of its own, such as Not found, is named for the address it was opened at. Pages and groups set their own where the
// engagement's skin decides. The wording lives in lib/brand/screens.ts.
export async function generateMetadata(): Promise<Metadata> {
  return {
    ...screenMetadata(await addressSkin()),
    robots: { index: false, follow: false },
    other: { "clearway-release": process.env.VERCEL_GIT_COMMIT_SHA || "unknown" },
  };
}
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}

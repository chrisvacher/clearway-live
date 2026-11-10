import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const shareTitle = "Clearway Live";
const shareDescription = "Every voice in the room, on one screen. How Clearway runs Wayfinding retreats and team workshops.";

// The share image is app/opengraph-image.png (and twitter-image.png), source in design/social/.
export const metadata: Metadata = {
  metadataBase: new URL("https://live.clearway.co"),
  title: { default: "Clearway Live", template: "%s | Clearway Live" },
  description: "A shared space for your church team to listen, discern and decide together.",
  robots: { index: false, follow: false },
  openGraph: { type: "website", siteName: "Clearway Live", title: shareTitle, description: shareDescription },
  twitter: { card: "summary_large_image", title: shareTitle, description: shareDescription },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}

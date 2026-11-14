import type { Metadata } from "next";
import { pageTitle, screensFor } from "./screens";
import type { Skin } from "./brands";

// Novetera's home-screen icon and favicon, served from public/novetera/ (the N mark; made by a script that is not committed).
// Clearway serves none today, so Clearway's metadata carries no icons and stays as it was.
const noveteraIcons: Metadata["icons"] = {
  icon: [{ url: "/novetera/icon.svg", type: "image/svg+xml" }, { url: "/novetera/icon-32.png", sizes: "32x32", type: "image/png" }, { url: "/novetera/icon-192.png", sizes: "192x192", type: "image/png" }],
  apple: [{ url: "/novetera/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
};
// The default metadata for the room, TV and public screens of a skin: the title (with its template, so a page's own title becomes
// "<page> | <site>"), the description and the icons.
export function screenMetadata(skin: Skin): Metadata {
  const s = screensFor(skin);
  return { title: { default: s.siteName, template: s.titleTemplate }, description: s.description, ...(skin === "novetera" ? { icons: noveteraIcons } : {}) };
}
// A page's own title for a skin, written out in full (for a page that sets its own metadata beside a layout's template).
export function screenPage(skin: Skin, page?: string): Metadata {
  return { title: { absolute: pageTitle(skin, page) }, ...(skin === "novetera" ? { icons: noveteraIcons } : {}) };
}

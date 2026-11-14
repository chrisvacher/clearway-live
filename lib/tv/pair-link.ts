// "Open the TV in a new window": a facilitator who runs a room from one laptop opens the TV as a second window on that
// laptop, and it pairs itself with a single-use link. The server mints the token and stores only its keyed hash; the
// database decides whether a claim is good (5 minutes, once, this engagement, a facilitator who can still pair a TV).
// This file holds the parts that need no server: the token's shape, the address, and the click-to-window sequence.

// How long a link lasts. The database holds the same number (private.tv_pair_link).
export const pairLinkMs = 5 * 60 * 1000;
// The window the facilitator drags to the TV or shares in a call.
export const tvWindowFeatures = "popup=yes,width=1280,height=720,left=80,top=80";
export const tvWindowName = "cwl-tv";
export const expiredLinkLine = "That link has expired. Enter this code on Screens instead.";
export const blockedPopupLine = "Your browser blocked the pop-up window, so the TV opened in a new tab.";

// 32 random bytes as base64url: 43 characters.
export const pairTokenShape = /^[A-Za-z0-9_-]{43}$/;
export function newPairToken(random: (bytes: number) => Uint8Array = bytes => crypto.getRandomValues(new Uint8Array(bytes))) {
  return btoa(String.fromCharCode(...random(32))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export const pairToken = (value: unknown) => typeof value === "string" && pairTokenShape.test(value) ? value : null;
// The engagement's own address, so a Novetera engagement's TV opens at live.novetera.co and draws Novetera.
export const tvLinkAddress = (origin: string, token: string) => `${origin}/tv?pair=${encodeURIComponent(token)}`;

// The token a TV page was opened with, or null.
export function tokenInSearch(search: string) { return pairToken(new URLSearchParams(search).get("pair")); }
// The same address without ?pair=, so a reload or a copied URL cannot reuse the link.
export function withoutToken(path: string, search: string, hash = "") {
  const params = new URLSearchParams(search); params.delete("pair"); const rest = params.toString();
  return `${path}${rest ? `?${rest}` : ""}${hash}`;
}

type Popup = { location: { href: string }; close: () => void; opener: unknown };
export type WindowHost = { open: (url?: string, target?: string, features?: string) => Popup | null };
export type OpenResult = { how: "window" | "tab" | "failed" | "link"; url?: string };
// One click. The window opens first, while the click still counts, and is pointed at the link when the server has made
// it; browsers that refuse a pop-up get the same link in a new tab, and one that refuses that too is handed the link.
export async function openTvWindow(host: WindowHost, issue: () => Promise<string | null>): Promise<OpenResult> {
  const popup = host.open("", tvWindowName, tvWindowFeatures);
  if (popup) popup.opener = null;
  let url: string | null = null;
  try { url = await issue(); } catch { url = null; }
  if (!url) { popup?.close(); return { how: "failed" }; }
  if (popup) { popup.location.href = url; return { how: "window" }; }
  const tab = host.open(url, "_blank");
  if (tab) { tab.opener = null; return { how: "tab" }; }
  return { how: "link", url };
}

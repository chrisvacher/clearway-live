// Every room-facing name, title and label the screens carry, one entry per skin, so no screen types "Clearway" or "Novetera"
// itself: browser tab titles, aria labels, the names on the TV's mark. Facilitator screens keep Clearway Live and don't read this.
// Safe to import from server and client code (no env, no server-only). Addresses come from brandFor(), so a client component that
// needs a non-default origin is passed one from the server.
import type { Skin } from "./brands";

// The theme a participant's phone draws in. Novetera phones draw on Chalk (the canvas's Phone artboards); Charcoal stays
// available: change "light" to "dark" here and every Novetera phone follows. Clearway phones stay dark.
export const phoneTheme: Record<Skin, "light" | "dark"> = { clearway: "dark", novetera: "light" };

export type Screens = {
  siteName: string;          // the name in tab titles and the wordmark's label
  titleTemplate: string;     // a page title becomes "<page> | <site>"
  description: string;       // the default page description
  homeLabel: string;         // the aria label on the brand link in a phone's header
  markLabel: { live: string; down: string; quiet: string; plain: string };  // the TV and phone mark, by state (Clearway keeps its own words)
  closed: string;            // the marker beside the mark while a step is closed
};

const screens: Record<Skin, Screens> = {
  clearway: {
    siteName: "Clearway Live", titleTemplate: "%s | Clearway Live",
    description: "A shared space for your church team to listen, discern and decide together.",
    homeLabel: "Clearway Live home",
    markLabel: { live: "Live", down: "Phones down", quiet: "Clearway Live", plain: "Clearway Live" },
    closed: "Closed",
  },
  novetera: {
    siteName: "Novetera", titleTemplate: "%s | Novetera",
    description: "A shared space for your church team to listen, discern and decide together.",
    homeLabel: "Novetera home",
    markLabel: { live: "Novetera, live", down: "Novetera, phones down", quiet: "Novetera, nothing live", plain: "Novetera" },
    closed: "Closed",
  },
};
export const screensFor = (skin: Skin): Screens => screens[skin];
export const pageTitle = (skin: Skin, page?: string): string => page ? screens[skin].titleTemplate.replace("%s", page) : screens[skin].siteName;

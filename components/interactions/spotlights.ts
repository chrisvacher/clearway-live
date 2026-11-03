import type { InteractionKind } from "@/lib/interactions/kinds";
import type { LiveSnapshot } from "@/lib/live/types";
import { barSpot } from "@/lib/interactions/bars";
import { signSpot } from "@/lib/interactions/grid-form-sign";

// What Spotlight lifts over the scrim for a kind that spotlights by item key, read from the
// server's results. Word cloud and the wall are the TV's own. Each step adds its kinds here,
// one line each.
export type SpotText = { text: string; meta: string };
export const spotlights: Partial<Record<InteractionKind, (frame: LiveSnapshot, key: string) => SpotText | null>> = {
  choice: (frame, key) => barSpot("choice", frame.state.results, key),
  scale: (frame, key) => barSpot("scale", frame.state.results, key),
  ranking: (frame, key) => barSpot("ranking", frame.state.results, key),
  points: (frame, key) => barSpot("points", frame.state.results, key),
  statements: (frame, key) => barSpot("statements", frame.state.results, key),
  sign: (frame, key) => signSpot(frame.state.results, key),
};

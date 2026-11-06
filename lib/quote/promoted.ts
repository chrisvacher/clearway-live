import { uuid } from "../room/identity";

// Promoting a scribe quote to the TV (FAC-01). The words go as the scribe wrote them, anonymously.
export type QuoteBody = { action: "promote"; card: string } | { action: "take_down" };

export function quoteBody(value: unknown): QuoteBody | null {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  if (v.action === "take_down") return { action: "take_down" };
  if (v.action === "promote" && uuid(v.card)) return { action: "promote", card: String(v.card).toLowerCase() };
  return null;
}

// The quote's words split for the treatment: light, with the second half bold (the Scripture screen's).
export function quoteParts(text: string): [string, string] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return [words.join(" "), ""];
  const cut = Math.max(1, Math.floor(words.length * 0.55));
  return [words.slice(0, cut).join(" "), words.slice(cut).join(" ")];
}

// Why Promote is off, in plain words, or null when it can be pressed.
export function promoteBlock(live: { team_led: boolean } | null, card: { kind: string; text: string }): string | null {
  if (card.kind !== "quote") return "Only quotes go on the TV.";
  if (!card.text.trim()) return "This quote has no words to show.";
  if (!live) return "Put a step on the TV first.";
  if (live.team_led) return "The team has the room, so a quote can’t go on the TV now.";
  return null;
}

export const quoteMessages: Record<string, string> = {
  nothing_live: "Put a step on the TV first.",
  team_led: "The team has the room, so a quote can’t go on the TV now.",
  not_found: "That quote is no longer there.",
  not_a_quote: "Only quotes go on the TV.",
  no_words: "This quote has no words to show.",
  denied: "Only a facilitator can put a quote on the TV.",
  invalid_request: "That didn’t go through. Try again.",
};

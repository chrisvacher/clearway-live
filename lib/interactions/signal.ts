// The alignment signal (FAC-02, FAC-03): the shapes the server sends and the pure rules the control surface and the remote share.
// Private to the lead and the co-facilitator. None of it reaches the TV, a phone, the scribe console or a team facilitator.
// Every number is worked out by the database from the sources; the model writes none.
import { uuid } from "../room/identity";

export type SignalKind = "aligned" | "divergent" | "silent" | "thin";
export type SignalTheme = { id: string; label: string; detail: string; source: string; rests_on: number; out_of: number | null; thin: boolean; strong: boolean; quotes: string[] };
export type SignalEvidence = {
  theme: SignalTheme; also: { id: string; label: string; source: string; rests_on: number; out_of: number | null }[];
  room: { answers: number; cards: number; unit: "answer" | "sentence" | "question"; samples: string[]; ids: string[] }; phones_down: boolean; at: string;
};
export type SignalCardData = { id: string; kind: SignalKind; theme_id: string | null; title: string; line: string; ask: string | null; evidence: SignalEvidence; saved: boolean; on_tv: boolean; at: string; updated: string };
export type SignalState = {
  status: "ok"; version: number; engagement_ai: boolean;
  session: null | { id: string; title: string; interaction: string; live: boolean; state: string; eligible: boolean; ai: boolean };
  themes: number; strong: number; phones_down: boolean; held: number;
  ask: null | { text: string; signal: string | null }; team: string | null; signals: SignalCardData[];
  state: { running: boolean; catching_up: boolean; last_at: string | null };
};

export const signalKinds: Record<SignalKind, { label: string; word: string }> = {
  aligned: { label: "Aligned", word: "The room is saying what Discover found." },
  divergent: { label: "Divergent", word: "The room is heading a different way." },
  silent: { label: "Silent", word: "A strong theme the room has not touched." },
  thin: { label: "Thin data", word: "The room spoke to a theme with little behind it." },
};
export const signalSourceLabel = (source: string) => source === "survey" ? "Survey" : source === "four_lists" ? "Four Helpful Lists" : "Leadership conversations";
const people = (source: string) => source === "survey" ? "survey respondents" : source === "four_lists" ? "people" : "conversations";
// "60 of 100 survey respondents", or the count alone when the total is not known.
export const strengthText = (t: Pick<SignalTheme, "source" | "rests_on" | "out_of">) => t.out_of ? `${t.rests_on} of ${t.out_of} ${people(t.source)}` : `${t.rests_on} ${people(t.source)}`;
export const weightText = (t: Pick<SignalTheme, "thin" | "strong">) => t.strong ? "Strong" : t.thin ? "Thin" : "In between";
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
export function roomText(e: SignalEvidence) {
  const unit = e.room.unit, bits = [e.room.answers ? plural(e.room.answers, unit) : "", e.room.cards ? plural(e.room.cards, "scribe card") : ""].filter(Boolean);
  return bits.length ? bits.join(" and ") : "Nothing from the room yet";
}

export const signalActions = ["dismiss", "save_citation", "ask", "back"] as const;
export type SignalAction = typeof signalActions[number];
export const askMax = 200;
// Validates a browser press into the RPC's arguments. The database checks it again.
export function signalBody(value: unknown): { id: string; action: SignalAction; signal: string | null; p: { text?: string } } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!uuid(v.id) || !signalActions.includes(v.action as SignalAction)) return null;
  const action = v.action as SignalAction;
  if (action === "back") return { id: v.id as string, action, signal: null, p: {} };
  if (!uuid(v.signal)) return null;
  if (action !== "ask") return { id: v.id as string, action, signal: v.signal as string, p: {} };
  if (v.text === undefined) return { id: v.id as string, action, signal: v.signal as string, p: {} };
  if (typeof v.text !== "string") return null;
  const text = v.text.replace(/\s+/g, " ").trim();
  return text.length >= 1 && text.length <= askMax ? { id: v.id as string, action, signal: v.signal as string, p: { text } } : null;
}

export const signalMessages: Record<string, string> = {
  names_signal: "Keep the question neutral: no theme, figure or signal in it.", filtered: "That wording is screened by the word filter.",
  invalid_state: "The question can only go up over the live step.", invalid_request: "Write a question of up to 200 characters.", missing: "That card is no longer there.",
  closed: "This engagement is closed.", unavailable: "Couldn't reach the room. Try again.", denied: "Only a facilitator can do that.",
};

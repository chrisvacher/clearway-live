// The results recap (PRD "Outputs > Results recap"): one card per session, its results as
// they appeared on the TV. The server sends each session's public fields and results from
// the same results functions the TV uses; this turns one into the frame the TV's own view
// draws, so the card is the TV's picture, not a second rendering of the numbers.
import type { LiveAnswer, LiveResults, LiveSession, LiveSnapshot } from "../live/types";
import type { TvAppearance } from "../tv/types";
import { countOf, countUnit, kindOf } from "../interactions/kinds";

export type RecapEntry = { part: string; mode: "live" | "self_paced"; opens_at: string | null; closes_at: string | null; session: LiveSession;
  hidden_keys: string[]; hidden_ids: string[]; results: LiveResults; answers: LiveAnswer[];
  // The rows this session's CSV holds (every answer not deleted or withdrawn), counted by the server.
  csv_rows?: number };
export type Recap = { status: "ok"; server_time: string; version: number; display: TvAppearance; sessions: RecapEntry[] };

export function recapFrame(recap: Pick<Recap, "display" | "server_time" | "version">, entry: RecapEntry): LiveSnapshot {
  return {
    status: "ok", role: "facilitator", topic: "", version: recap.version, next: null, phone_depth: null, server_time: recap.server_time,
    display: recap.display, presence: { count: 0, names: [] }, qa: null, answer: null,
    // Shown as a step on the TV: no spotlight, no burst, nothing held down.
    state: { engagement_id: "", live_session_id: entry.session.id, version: recap.version, tv_content: "session", phones_down: false, burst_ends_at: null,
      spotlight_key: null, spotlight_id: null, hidden_keys: entry.hidden_keys, hidden_ids: entry.hidden_ids, show_tv_on_phones: false, results: entry.results },
    // Closed steps show the quiet mark beside Closed; a recap card has no live mark at all.
    session: { ...entry.session, state: entry.session.state === "closed" ? "closed" : "open" },
    answers: entry.answers,
  };
}
// "8 answering", "23 answers", "9 questions": the TV's own count words, over the rows the card's CSV
// holds, so the number on the card and the file never disagree. The TV's results count words in a word
// cloud and only waiting questions in Q&A; the recap counts what was sent.
export function recapCount(entry: RecapEntry) {
  const kind = kindOf(entry.session), n = typeof entry.csv_rows === "number" ? entry.csv_rows : countOf(entry.results, kind?.counts);
  return `${n} ${countUnit(n, kind?.counts, entry.session.interaction)}`;
}
// Only what changed: a card redraws when its session's results, answers or text move.
export const recapKey = (entry: RecapEntry) => JSON.stringify([entry.session.revision, entry.session.state, entry.results, entry.answers.map(a => [a.id, a.revision]), entry.hidden_keys, entry.hidden_ids, entry.csv_rows ?? null]);

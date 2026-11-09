import type { Limits, OutboxEntry, OwnAnswer } from "./types";

// Mirrors the database's checks so the phone holds Send and says why, never
// cutting an answer silently. The database checks again on every send.
export function checkAnswer(text: string, limits: Limits): { ok: boolean; message: string; count: string } {
  const trimmed = text.trim();
  if (limits.interaction === "wall") {
    const length = [...trimmed].length;
    return { ok: length > 0 && length <= limits.max_characters, count: `${length} / ${limits.max_characters}`,
      message: length > limits.max_characters ? `${length - limits.max_characters} characters over. Keep it to ${limits.max_characters}.` : "" };
  }
  const parts = trimmed ? trimmed.split(",").map(part => part.trim()) : [];
  const longest = Math.max(0, ...parts.map(part => [...part].length));
  const words = Math.max(0, ...parts.map(part => part.replace(/[^\p{L}\p{N}\s]/gu, "").trim().split(/\s+/).filter(Boolean).length));
  const count = `${longest} / ${limits.max_characters}`;
  if (!trimmed) return { ok: false, message: "", count };
  if (parts.length > 5) return { ok: false, message: "Up to 5 answers at once, separated by commas.", count };
  if (parts.some(part => !part)) return { ok: false, message: "Remove the empty answer between the commas.", count };
  if (words > limits.max_words) return { ok: false, message: `${words} words. Keep it to ${limits.max_words}.`, count };
  if (longest > limits.max_characters) return { ok: false, message: `Keep each answer to ${limits.max_characters} characters.`, count };
  return { ok: true, message: "", count };
}
export function limitHint(limits: Limits) {
  return limits.interaction === "wall" ? `Up to ${limits.max_characters} characters` : `Up to ${limits.max_words} ${limits.max_words === 1 ? "word" : "words"}`;
}

// Every send counts toward the limit, including withdrawn answers, as on the server.
export function sendsUsed(session: string, answers: OwnAnswer[], outbox: OutboxEntry[]) {
  const sent = new Set(answers.filter(a => a.session_id === session).map(a => a.id));
  for (const entry of outbox) if (entry.request.session === session && entry.request.action === "submit" && entry.state !== "failed") sent.add(entry.request.id);
  return sent.size;
}

// Answers this page saw the server accept, held until a read of the phone's own view that
// began after each one settled. From then on the server's list decides, so an answer it no
// longer holds (Clear test answers removed it) leaves the phone and stops counting.
export type SettledAnswer = OwnAnswer & { settledAt: number };
export function keepSettled(settled: SettledAnswer[], readStartedAt: number) {
  return settled.filter(a => a.settledAt >= readStartedAt);
}

export type ShownAnswer = { id: string; text: string; value?: unknown; revision: number; status: "sent" | "saved" | "sending" | "failed"; reason?: string; withdrawn: boolean };
// The person's own answers for one step: what the server holds, overlaid with
// what is still on this phone, newest change winning, in the order written. For a
// one-answer-per-person kind only the latest stands, as on the server.
export function ownAnswers(session: string, answers: OwnAnswer[], outbox: OutboxEntry[], online: boolean, onePerPerson = false): ShownAnswer[] {
  const shown = new Map<string, ShownAnswer>();
  for (const a of answers.filter(a => a.session_id === session)) shown.set(a.id, { id: a.id, text: a.text, ...(a.value !== undefined && a.value !== null ? { value: a.value } : {}), revision: a.revision, status: "sent", withdrawn: a.withdrawn });
  for (const entry of outbox.filter(e => e.request.session === session)) {
    const r = entry.request, before = shown.get(r.id);
    if (before && before.status === "sent" && before.revision >= r.revision) continue;
    // Sent shows the moment an answer leaves the phone. One that had to wait
    // says Saved on this phone, then Sending once the connection is back.
    const status = entry.state === "failed" ? "failed" : !r.queuedAt ? "sent" : online && entry.state === "sending" ? "sending" : "saved";
    const value = r.action === "withdraw" ? before?.value : r.value;
    shown.set(r.id, { id: r.id, revision: r.revision, withdrawn: r.action === "withdraw", text: r.action === "withdraw" ? before?.text ?? r.text : r.text, ...(value !== undefined ? { value } : {}), status, reason: entry.reason });
  }
  const standing = [...shown.values()].filter(a => !a.withdrawn);
  return onePerPerson ? standing.slice(-1) : standing;
}

// Outcomes the server has settled are never retried; anything else waits and retries in order.
export function settledReason(status: string): string | null {
  switch (status) {
    case "accepted": case "duplicate": return "";
    case "closed": return "This step closed before your answer arrived.";
    case "stale": return "The summary changed before your answer arrived. Read the new version.";
    case "limit": return "This answer is over the limit.";
    case "filtered": return "That answer can’t go on the screen. Try different words.";
    case "invalid_answer": case "invalid_request": case "invalid_session": case "conflict": return "This answer couldn’t be sent.";
    default: return null;
  }
}

// The self-paced list hides only under a live step that takes input. A content step (holding, scripture, prayer,
// headline, image, screen check) leaves it visible, so a holding screen that says "Pick a lens on your phone" works.
export function selfListHidden(isLive: boolean, running: boolean, takesInputKind: boolean): boolean {
  return isLive && running && takesInputKind;
}

// "Signed in on this phone. Your earlier answers are here." shows once for each sign-in on this phone. The
// flag lives in session storage, keyed by the engagement and the signed-in person, so a reload doesn't bring
// it back and a different person signing in on the same phone sees it once too. Storage that throws (private
// mode) counts as "not seen" and "not saved", so the line still shows and never breaks the screen.
export const bannerKey = (engagement: string, person: string | null | undefined) => `cw-signed-in-${engagement}-${person ?? ""}`;
type FlagStore = Pick<Storage, "getItem" | "setItem">;
export function bannerTaken(store: FlagStore | null, key: string): boolean {
  try { if (store?.getItem(key)) return true; store?.setItem(key, "1"); } catch { /* Storage is closed: show it. */ }
  return false;
}

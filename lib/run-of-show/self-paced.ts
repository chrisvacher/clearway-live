import { uuid } from "../room/identity";

// Self-paced sessions open and close on their times (PRD "Session states"). The server
// works the state out whenever it is read; a phone or control surface works it out the
// same way between reads, from the server's clock, so a session opens and closes on
// time on screen too. The server checks again on every answer.
export type SelfPacedTimes = { mode?: string; state: string; opens_at?: string | null; closes_at?: string | null };
export function selfPacedState(session: SelfPacedTimes, serverNow: number): string {
  if (session.mode !== "self_paced" || session.state === "draft" || !session.opens_at || !session.closes_at) return session.state;
  return serverNow < Date.parse(session.opens_at) ? "ready" : serverNow < Date.parse(session.closes_at) ? "open" : "closed";
}
// The next time a self-paced session's state changes, so a screen can read again then.
export function nextBoundary(sessions: SelfPacedTimes[], serverNow: number): number | null {
  const times = sessions.flatMap(s => s.mode === "self_paced" && s.state !== "draft" ? [s.opens_at, s.closes_at] : [])
    .map(t => t ? Date.parse(t) : NaN).filter(t => Number.isFinite(t) && t > serverNow);
  return times.length ? Math.min(...times) : null;
}

// Close the day (PRD "Going live") closes every step still open in its part: live steps that
// are live, phones down or taking late answers, and self-paced steps open by their clock. The
// control surface offers it while any of them is open.
export type PartStep = SelfPacedTimes & { part: string };
export function partOpen(part: string, steps: PartStep[], serverNow: number): boolean {
  return steps.some(s => s.part === part && (s.mode === "self_paced" ? selfPacedState(s, serverNow) === "open" : ["live", "phones_down", "open"].includes(s.state)));
}
// Close the day can end a self-paced step early, which changes its close time on the server.
// A phone with one open reads its own view again when the room's version rises, at most once
// every gap milliseconds, and once more after the last rise: this says how long to wait.
export function recheckDelay(lastRead: number, now: number, gap = 3000): number {
  return Math.max(0, lastRead + gap - now);
}

const when = (iso: string, zone: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
// "Open until Tue, Nov 10, 9:00 p.m.", in the church's time zone.
export function windowLabel(session: SelfPacedTimes, zone: string, serverNow: number): string {
  if (!session.opens_at || !session.closes_at) return "";
  const state = selfPacedState({ ...session, mode: "self_paced" }, serverNow);
  if (state === "draft") return `Draft. Opens ${when(session.opens_at, zone)}`;
  if (state === "ready") return `Opens ${when(session.opens_at, zone)}`;
  if (state === "open") return `Open until ${when(session.closes_at, zone)}`;
  return `Closed ${when(session.closes_at, zone)}`;
}

// The invite email's link to a self-paced session: the room, with the person's email
// filled in and the session to open once they're signed in.
export function selfPacedLink(origin: string, engagement: string, session: string, email: string) {
  const url = new URL(`/room/${engagement}`, origin);
  url.searchParams.set("email", email); url.searchParams.set("step", session);
  return url.toString();
}
// The step a room link asks to open, if it is a real id.
export const requestedStep = (search: string) => { const step = new URLSearchParams(search).get("step"); return uuid(step) ? step : null; };

// Rehearsal presses from the control surface. The database checks them again.
export const rehearsalActions = ["start", "end", "clear"] as const;
export type RehearsalAction = typeof rehearsalActions[number];
export function rehearsalBody(value: unknown): { id: string; action: RehearsalAction } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  return uuid(v.id) && rehearsalActions.includes(v.action as RehearsalAction) ? { id: v.id as string, action: v.action as RehearsalAction } : null;
}
export function rehearsalMessage(result: { status: string; answers?: number; sessions?: number; title?: string }): string {
  switch (result.status) {
    case "ok": case "duplicate":
      return result.answers === undefined ? "" : `Cleared ${result.answers} test ${result.answers === 1 ? "answer" : "answers"}${result.sessions ? ` and set ${result.sessions} ${result.sessions === 1 ? "step" : "steps"} back to Ready` : ""}.`;
    case "unchanged": return "";
    case "live": return `${result.title ? `${result.title} is live. ` : ""}Choose Nothing live first. Test answers can’t be cleared while a session is live.`;
    case "closed": return "This engagement has closed.";
    case "denied": return "Only this engagement’s facilitators can do that.";
    default: return "That didn’t go through. Try again.";
  }
}

// The Rehearsal panel's count: every test item Clear test answers removes (answers, votes, suggestions, scribe cards
// and files), so the plainer word is "items". Clear is on whenever there is one, or a rehearsal is running.
export const testItemsLabel = (n: number) => `${n} test ${n === 1 ? "item" : "items"}`;
export const canClearTests = (items: number, rehearsing: boolean) => items > 0 || rehearsing;

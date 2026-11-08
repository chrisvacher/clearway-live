// What the check-ins are, apart from the database and the network: the words, the grouping of owners into people, the clock.
// Plain functions, so the tests can read them without a server.

export type StepAnswer = "done" | "under_way" | "stuck";
export type GoalAnswer = "not_started" | "on_track" | "at_risk" | "off_track" | "done";
export const stepAnswers: StepAnswer[] = ["done", "under_way", "stuck"];
export const goalAnswers: GoalAnswer[] = ["not_started", "on_track", "at_risk", "off_track", "done"];
export const answerLabel: Record<string, string> = {
  done: "Done", under_way: "Under way", stuck: "Stuck", not_started: "Not started", on_track: "On track", at_risk: "At risk", off_track: "Off track",
};
// Goals read "Done" the same way steps do. The label is the same word, so the page needs one table.
export const noteLimit = 500;
export const days = [30, 60, 90] as const;

// An address on .example, .invalid or .test is never emailed. Rows for it say so, and Open as this person stands in for the email.
export { fictionalEmail } from "@/lib/room/practice";

export type Owned = { kind: "step" | "goal"; id: string; label: string; date: string | null; email: string; name: string | null; attendee: string | null; ord: number };
export type Person = { email: string; name: string; attendee: string | null; steps: string[]; goals: string[] };

// One person for each distinct owner email, in their own email, with only the first steps and goals they own.
// A goal owner who owns no first step is still a person. Order follows the records, so the email reads as the plan does.
export function groupRecipients(owned: Owned[]): Person[] {
  const people = new Map<string, Person>();
  const sorted = [...owned].sort((a, b) => a.ord - b.ord || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  for (const item of sorted) {
    const email = item.email.trim().toLowerCase();
    if (!email) continue;
    const person = people.get(email) ?? { email, name: "", attendee: null, steps: [], goals: [] };
    if (!person.name && item.name?.trim()) person.name = item.name.trim();
    if (!person.attendee && item.attendee) person.attendee = item.attendee;
    (item.kind === "step" ? person.steps : person.goals).push(item.id);
    people.set(email, person);
  }
  return [...people.values()].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email) || a.email.localeCompare(b.email))
    .map(person => ({ ...person, name: person.name || person.email }));
}

// The date the scheduled run works to. CLEARWAY_NOW sets it for tests and is refused in production.
export function today(env: Record<string, string | undefined> = process.env, now = new Date()): string {
  const set = env.CLEARWAY_NOW;
  if (set && env.VERCEL_ENV !== "production") {
    const parsed = new Date(set);
    if (/^\d{4}-\d{2}-\d{2}/.test(set) && !Number.isNaN(parsed.getTime())) return set.slice(0, 10);
  }
  return now.toISOString().slice(0, 10);
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function shortDate(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return match ? `${months[Number(match[2]) - 1]} ${Number(match[3])}` : "";
}
export function longDate(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return match ? `${months[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}` : "";
}

export const tokenShape = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(value);

// The same shapes the database returns.
export type PhoneItem = { id: string; text?: string; title?: string; due?: string | null; end?: string | null; answer: string | null; note: string | null };
export type PhoneView =
  | { status: "ok"; church: string; first: string; name: string; day: number; editable: boolean; newest_day: number | null; newest_sent_at: string | null; sent_at: string | null; next_on: string | null; help: string | null; answered_at: string | null; steps: PhoneItem[]; goals: PhoneItem[] }
  | { status: "ended"; church: string }
  | { status: "unknown" };

export type ResultStep = { id: string; text: string; due: string | null; answer: StepAnswer | null; note: string | null; answer_id: string | null; followed_up_at: string | null; answered_at: string | null };
export type ResultGoal = { id: string; title: string; end: string | null; answer: GoalAnswer | null; note: string | null; answer_id: string | null; followed_up_at: string | null; answered_at: string | null };
export type ResultRecipient = { id: string; name: string; email: string; send_result: "sent" | "practice_address" | "failed" | null; sent_at: string | null; opened_at: string | null; answered_at: string | null; help: string | null; practice: boolean; steps: ResultStep[]; goals: ResultGoal[] };
export type ResultRound = { id: string; day: 30 | 60 | 90; due_on: string; status: "scheduled" | "sending" | "sent" | "off"; superseded: boolean; sent_at: string | null; sent_by: string | null; recipients: ResultRecipient[] };
export type CheckInState = { status: "ok"; server_time: string; type: string; engagement_status: string; eligible: boolean; practice: boolean; retreat_closed_on: string | null; can_switch_on: boolean; owners: number; rounds: ResultRound[] };

// One line for the After hub: where the next round stands.
export function checkInLine(state: CheckInState): string {
  if (!state.eligible) return "This kind of engagement doesn’t use check-ins.";
  if (state.rounds.length === 0) return "Not set up yet. They start when the retreat closes.";
  const next = state.rounds.find(r => (r.status === "scheduled" && !r.superseded) || r.status === "sending");
  if (next) return next.status === "sending" ? `The ${next.day}-day check-in is going out now.` : `The ${next.day}-day check-in goes out ${longDate(next.due_on)}.`;
  const sent = state.rounds.filter(r => r.status === "sent");
  if (sent.length === 0) return "Check-ins are switched off.";
  return sent.length === state.rounds.length ? "All three check-ins have gone out." : `The ${sent[sent.length - 1].day}-day check-in has gone out. The rest are off.`;
}

export type FollowUp = { answer_id: string; kind: "step" | "goal"; who: string; what: string; answer: string; note: string | null; done: boolean };
// Stuck steps, and goals at risk or off track, from the newest round that went out.
export function followUps(round: ResultRound): FollowUp[] {
  const out: FollowUp[] = [];
  for (const person of round.recipients) {
    for (const step of person.steps) if (step.answer === "stuck" && step.answer_id) out.push({ answer_id: step.answer_id, kind: "step", who: person.name, what: step.text, answer: "stuck", note: step.note, done: !!step.followed_up_at });
    for (const goal of person.goals) if ((goal.answer === "at_risk" || goal.answer === "off_track") && goal.answer_id) out.push({ answer_id: goal.answer_id, kind: "goal", who: person.name, what: goal.title, answer: goal.answer, note: goal.note, done: !!goal.followed_up_at });
  }
  return out;
}

export type Counts = { people: number; sent: number; answered: number; practice: number; failed: number; opened: number };
export function roundCounts(round: ResultRound): Counts {
  const r = round.recipients;
  return { people: r.length, sent: r.filter(x => x.send_result === "sent").length, practice: r.filter(x => x.send_result === "practice_address").length,
    failed: r.filter(x => x.send_result === "failed").length, answered: r.filter(x => x.answered_at).length, opened: r.filter(x => x.opened_at).length };
}

const csvCell = (value: unknown) => {
  let text = value == null ? "" : String(value);
  // A cell that starts like a formula is a risk in a spreadsheet. A leading quote keeps it text.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
export function resultsCsv(rounds: ResultRound[]): string {
  const rows: unknown[][] = [["Round", "Due on", "Person", "Kind", "Item", "Answer", "Note", "Followed up"]];
  for (const round of rounds) for (const person of round.recipients) {
    for (const s of person.steps) rows.push([`${round.day} days`, round.due_on, person.name, "First step", s.text, s.answer ? answerLabel[s.answer] : "No answer", s.note ?? "", s.followed_up_at ? "Yes" : ""]);
    for (const g of person.goals) rows.push([`${round.day} days`, round.due_on, person.name, "Goal", g.title, g.answer ? answerLabel[g.answer] : "No answer", g.note ?? "", g.followed_up_at ? "Yes" : ""]);
  }
  return rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

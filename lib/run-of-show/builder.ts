// The drag-to-build run of show (SET-07, design pass 3 change 15). Pure rules shared by the
// builder, its keyboard path and the tests: the palette, a dropped session's defaults, where a
// drop lands, and the times worked out from the durations (the server's show_retime does the
// same, so what the builder shows before Save is what the database stores).
import { contentLabels, type ContentScreen, type InteractionKind, type KindInfo } from "../interactions/kinds";
import { parts, type Part, type ShowSession } from "./types";

export type PaletteEntry = { id: string; kind: InteractionKind; screen?: ContentScreen; label: string; blurb: string; minutes: number };

const blurbs: Partial<Record<InteractionKind, string>> = {
  word_cloud: "Short answers sized by how often", wall: "Sentences grouped as they arrive", qa: "Questions the room votes up",
  choice: "Live bars for one or many picks", scale: "The average and the spread", ranking: "Order options by what matters",
  points: "Share a budget across options", grid: "Place items on two axes", form: "Answers only facilitators see",
  sign: "Signatures and names on the screen", statements: "Rate agreement with each, 1 to 5", lens: "The 10-year Future in present-tense sentences", goals: "1-year goals with the four CORE checks",
  bullets: "What is true, one outcome at a time", confirm: "Confirm, rename or challenge each outcome",
  intent: "One card per outcome, written in pairs", candidates: "Name the priorities, then spend 100 points",
};
const screenBlurbs: Record<ContentScreen, string> = {
  scripture: "Passage, reference, translation", headline: "One line on the TV, depth on phones", prayer: "A still screen or a single line",
  image: "An image or document page", holding: "Walk-in and break screen", screen_check: "Set up the TV before the room arrives",
};
// Starting lengths in minutes (the pass 3 builder's), editable per session.
export const kindMinutes: Partial<Record<InteractionKind, number>> = {
  word_cloud: 10, wall: 15, qa: 10, choice: 5, scale: 5, ranking: 10, points: 15, grid: 15, form: 10, sign: 5, statements: 5, goals: 20, lens: 15, content: 5, bullets: 15, confirm: 15, intent: 30, candidates: 25,
};
export const paletteScreens: ContentScreen[] = ["scripture", "headline", "prayer", "image", "holding", "screen_check"];

// Every interaction the server runs, then every content screen.
export function palette(kinds: KindInfo[]): { interactions: PaletteEntry[]; screens: PaletteEntry[] } {
  return {
    interactions: kinds.filter(k => k.kind !== "content").map(k => ({ id: k.kind, kind: k.kind, label: k.label, blurb: blurbs[k.kind] ?? "", minutes: kindMinutes[k.kind] ?? 5 })),
    screens: kinds.some(k => k.kind === "content") ? paletteScreens.map(screen => ({ id: `content:${screen}`, kind: "content" as const, screen, label: screen === "prayer" ? "Prayer" : screen === "image" ? "Image" : screen === "holding" ? "Holding" : contentLabels[screen], blurb: screenBlurbs[screen], minutes: 5 })) : [],
  };
}

// Starting options that pass each kind's check on the server, so a session can go as dropped.
const items = (word: string, n: number) => Array.from({ length: n }, (_, i) => ({ key: `o${i + 1}`, text: `${["First", "Second", "Third", "Fourth", "Fifth"][i]} ${word}` }));
export const dropOptions: Partial<Record<InteractionKind, Record<string, unknown>>> = {
  word_cloud: {}, wall: {}, qa: { any_time: false },
  choice: { items: items("option", 3), multiple: false },
  scale: { max: 5, low: "Not at all", high: "Completely" },
  ranking: { items: items("option", 4), suggest: false },
  points: { items: items("option", 5), cut: 0 },
  statements: { items: items("statement", 3), low: "Strongly disagree", high: "Strongly agree", flag_divided: true },
  grid: { preset: "custom", x_label: "Effort", x_low: "Low", x_high: "High", y_label: "Impact", y_low: "Low", y_high: "High", legend: "Items", items: [] },
  form: { questions: [{ key: "q1", text: "What would make this time a win for you?" }] },
  sign: {},
  intent: { assign: "remote" },
  candidates: { ai: true, cut: 5 },
};
const limits: Partial<Record<InteractionKind, [number, number, number]>> = { wall: [3, 280, 50], qa: [10, 200, 50] };
// Content screens that need their words before they can run start as drafts.
const readyScreens: ContentScreen[] = ["prayer", "holding", "screen_check"];

// A self-paced session (PRD "Mode") opens on phones between two times, outside the live
// room. Dropped as self-paced, it starts as a Draft with a window from the next whole hour
// for a week, so nothing opens until the facilitator sets the times and presses Done.
export type DropMode = "live" | "self_paced";
export function defaultWindow(now: number): { opens_at: string; closes_at: string } {
  const opens = Math.ceil((now + 1) / 3600000) * 3600000;
  return { opens_at: new Date(opens).toISOString(), closes_at: new Date(opens + 7 * 86400000).toISOString() };
}
// Content screens have no input, so they only run in the room.
export const canSelfPace = (entry: PaletteEntry) => entry.kind !== "content";

// A dropped session: saved at once as a draft (a still screen as Ready), with every default.
export function droppedSession(entry: PaletteEntry, engagement: string, part: Part, kinds: KindInfo[], id: string, mode: DropMode = "live", now = Date.now()): ShowSession {
  const info = kinds.find(k => k.kind === entry.kind), [max_sends, max_characters, max_words] = limits[entry.kind] ?? [3, 28, 3];
  const selfPaced = mode === "self_paced" && canSelfPace(entry), window = selfPaced ? defaultWindow(now) : { opens_at: null, closes_at: null };
  return {
    id, engagement_id: engagement, title: entry.label, part, position: 0, planned_start: null, planned_minutes: entry.minutes, mode: selfPaced ? "self_paced" : "live", ...window,
    interaction: entry.kind, prompt: "", phone_depth: "", notes: "", lands_in: "", segment: "", revision: 0,
    state: !selfPaced && entry.screen && readyScreens.includes(entry.screen) ? "ready" : "draft", max_sends, max_characters, max_words,
    settings: { anonymous: info?.named !== "always", burst_minutes: 4, join_strip: false },
    options: entry.kind === "content" ? { screen: entry.screen ?? "headline" } : { ...(dropOptions[entry.kind] ?? {}) },
  };
}

export const partOf = (sessions: ShowSession[], part: Part) => sessions.filter(s => s.part === part).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
// Clicking a tile adds it at the end of the run: the last part with sessions, or Day 1.
export function endOfRun(sessions: ShowSession[]): { part: Part; index: number } {
  const part = [...parts].reverse().find(p => sessions.some(s => s.part === p)) ?? "Day 1";
  return { part, index: partOf(sessions, part).length };
}

// Moves and inserts, as the server applies them (show_insert): the session leaves its
// place, then lands at the index among the rest of the target part.
export function placeSession(sessions: ShowSession[], session: ShowSession, part: Part, index: number): ShowSession[] {
  const rest = sessions.filter(s => s.id !== session.id);
  const target = partOf(rest, part), at = Math.max(0, Math.min(index, target.length));
  target.splice(at, 0, { ...session, part });
  const order = new Map(target.map((s, i) => [s.id, i]));
  const from = session.part !== part ? new Map(partOf(rest, session.part).map((s, i) => [s.id, i])) : null;
  return [...rest.filter(s => s.part !== part).map(s => from?.has(s.id) ? { ...s, position: from.get(s.id)! } : s), ...target.map(s => ({ ...s, position: order.get(s.id)! }))];
}

// Times from the durations (change 15). A part starts at its first live session's planned
// start, or the earliest set; each live session starts when the one before it ends.
// Self-paced sessions keep their own times and take no room time.
export type RunTime = { offset: number | null; at: string | null };
export function partTimes(sessions: ShowSession[]): Map<string, RunTime> {
  const live = sessions.filter(s => s.mode === "live");
  const anchor = live[0]?.planned_start ?? live.map(s => s.planned_start).filter((v): v is string => Boolean(v)).sort()[0] ?? null;
  const out = new Map<string, RunTime>(); let minutes = 0;
  for (const s of sessions) {
    if (s.mode !== "live") { out.set(s.id, { offset: null, at: s.opens_at }); continue; }
    out.set(s.id, { offset: minutes, at: anchor ? new Date(Date.parse(anchor) + minutes * 60000).toISOString() : null });
    minutes += s.planned_minutes;
  }
  return out;
}
export const liveMinutes = (sessions: ShowSession[]) => sessions.filter(s => s.mode === "live").reduce((n, s) => n + s.planned_minutes, 0);
// 90 becomes "1:30".
export const clock = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;

// Every place a session can land, in run order: each part's gaps, top to bottom.
export type Slot = { part: Part; index: number };
export function slots(sessions: ShowSession[], moving?: string): Slot[] {
  const rest = sessions.filter(s => s.id !== moving);
  return parts.flatMap(part => Array.from({ length: partOf(rest, part).length + 1 }, (_, index) => ({ part, index })));
}
export function stepSlot(all: Slot[], at: Slot, delta: number): Slot {
  const i = all.findIndex(s => s.part === at.part && s.index === at.index);
  return all[Math.max(0, Math.min(all.length - 1, (i < 0 ? all.length - 1 : i) + delta))];
}

// After a drop or a move, other sessions change position or planned start on the server
// without anyone editing them. An open editor can keep going when that is all that changed.
const stable = (value: unknown): string => Array.isArray(value) ? `[${value.map(stable).join(",")}]`
  : value && typeof value === "object" ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(value ?? null);
export function onlyMoved(before: ShowSession, after: ShowSession) {
  const strip = (s: ShowSession) => ({ ...s, position: 0, planned_start: null, revision: 0 });
  return stable(strip(before)) === stable(strip(after));
}

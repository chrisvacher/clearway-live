// Milestone 4, step 3: candidate priorities (INT-13). Pure rules shared by the TV view, the phone
// input, the control surface, the routes and the tests. The candidates and the points come from the
// server's results; what lives here is reading them, checking what a press carries before it is sent,
// and the plain words beside a refused press. Sources, lenses and who suggested what never appear in
// the TV's results, so none of them can be read here.

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown) => Array.isArray(value) ? value : [];
const isUuid = (x: unknown): x is string => typeof x === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x);
const clean = (x: unknown) => typeof x === "string" ? x.replace(/\s+/g, " ").trim() : "";
const int = (x: unknown) => typeof x === "number" && Number.isFinite(x) ? Math.trunc(x) : 0;

export const phases = ["review", "sent", "points", "marked"] as const;
export type Phase = typeof phases[number];
export const nameMax = 120;
export const cutRange = [4, 5, 6] as const;
export const pointsMax = 8;

// ---------- What the TV and phones read ----------
export type Candidate = { id: string; num: number; name: string; from: number; provisional: boolean };
export type CandidatesResults = { phase: Phase; candidates: Candidate[]; merges: { from: string; into: string }[]; people: number; total: number };
export function candidatesOf(results: unknown): CandidatesResults {
  const r = record(results), phase = phases.includes(r.phase as Phase) ? r.phase as Phase : "review";
  return {
    phase, people: int(r.people), total: int(r.total),
    candidates: list(r.candidates).flatMap(value => { const c = record(value); return isUuid(c.id) && clean(c.name) ? [{ id: String(c.id), num: int(c.num), name: clean(c.name), from: int(c.from), provisional: c.provisional === true }] : []; }),
    merges: list(r.merges).flatMap(value => { const m = record(value); return isUuid(m.from) && isUuid(m.into) ? [{ from: String(m.from), into: String(m.into) }] : []; }),
  };
}
// The phone's 100 points use the points fader over the candidates as its options.
export const pointsOptions = (candidates: Candidate[]) => ({ items: candidates.map(c => ({ key: c.id, text: c.name })) });

// ---------- A phone suggests ----------
export type SuggestBody = { id: string; session: string; p: { kind: "rename" | "merge" | "add"; candidate?: string; into?: string; text?: string } };
export function suggestBody(value: unknown): SuggestBody | null {
  const v = record(value);
  if (!isUuid(v.id) || !isUuid(v.session)) return null;
  const text = clean(v.text);
  if ([...text].length > nameMax) return null;
  const base = { id: String(v.id).toLowerCase(), session: String(v.session).toLowerCase() };
  if (v.kind === "add") return text ? { ...base, p: { kind: "add", text } } : null;
  if (v.kind === "rename") return isUuid(v.candidate) && text ? { ...base, p: { kind: "rename", candidate: String(v.candidate).toLowerCase(), text } } : null;
  if (v.kind === "merge") return isUuid(v.candidate) && isUuid(v.into) && v.candidate !== v.into
    ? { ...base, p: { kind: "merge", candidate: String(v.candidate).toLowerCase(), into: String(v.into).toLowerCase(), ...(text ? { text } : {}) } } : null;
  return null;
}

// ---------- The facilitator's presses ----------
export const candidateActions = ["draft", "add", "rename", "remove", "merge", "accept", "dismiss", "send", "hold", "open_points", "back", "cut", "mark"] as const;
export type CandidateAction = typeof candidateActions[number];
export type CandidatePress = { id: string; action: CandidateAction; p: Record<string, unknown> };
export function candidatePress(value: unknown): CandidatePress | null {
  const v = record(value);
  if (!isUuid(v.id) || (v.from !== null && !isUuid(v.from)) || !(candidateActions as readonly unknown[]).includes(v.action)) return null;
  const id = String(v.id).toLowerCase(), action = v.action as CandidateAction, from = v.from === null ? null : String(v.from).toLowerCase();
  const uuidOf = (x: unknown) => String(x).toLowerCase();
  switch (action) {
    case "add": {
      const name = clean(v.name); if (!name || [...name].length > nameMax) return null;
      const sources = v.sources === undefined ? [] : list(v.sources);
      if (sources.length > 60 || !sources.every(isUuid)) return null;
      return { id, action, p: { from, name, ...(sources.length ? { sources: sources.map(uuidOf) } : {}) } };
    }
    case "rename": { const name = clean(v.name); return isUuid(v.candidate) && name && [...name].length <= nameMax ? { id, action, p: { from, candidate: uuidOf(v.candidate), name } } : null; }
    case "remove": return isUuid(v.candidate) ? { id, action, p: { from, candidate: uuidOf(v.candidate) } } : null;
    case "merge": {
      const name = clean(v.name);
      return isUuid(v.candidate) && isUuid(v.into) && v.candidate !== v.into && [...name].length <= nameMax ? { id, action, p: { from, candidate: uuidOf(v.candidate), into: uuidOf(v.into), ...(name ? { name } : {}) } } : null;
    }
    case "accept": case "dismiss": { const ids = list(v.ids); return ids.length >= 1 && ids.length <= 100 && ids.every(isUuid) ? { id, action, p: { from, ids: ids.map(uuidOf) } } : null; }
    case "cut": return v.cut === 4 || v.cut === 5 || v.cut === 6 ? { id, action, p: { from, cut: v.cut } } : null;
    case "mark": {
      const reasons = typeof v.reasons === "string" ? v.reasons.trim() : "";
      if ([...reasons].length > 1000) return null;
      const ids = v.ids === undefined ? null : list(v.ids);
      if (ids && (ids.length < 1 || ids.length > pointsMax || !ids.every(isUuid))) return null;
      return { id, action, p: { from, ...(ids ? { ids: ids.map(uuidOf) } : {}), ...(reasons ? { reasons } : {}) } };
    }
    default: return { id, action, p: { from } };
  }
}

// ---------- The facilitator's read ----------
export type Source = { id: string; lens: number; text: string };
export type CandidateRow = { id: string; num: number; name: string; origin: "ai" | "facilitator" | "phone"; edited: boolean; from: number; marked: boolean; sources: Source[] };
export type SuggestionGroup = { ids: string[]; kind: "rename" | "merge" | "add"; candidate: string | null; candidate_name: string | null; into: string | null; into_name: string | null; text: string; count: number; by: string[] };
export type WallLens = { lens: number; name: string; open: boolean; loose: number; clusters: { label: string; count: number; sentences: { id: string; text: string }[] }[] };
export type AiState = { engagement_on: boolean; on: boolean; requested: boolean; running: boolean; failing: boolean; drafted_at: string | null; note: "no_sentences" | "short" | "empty" | null };
export type CandidatesState = { status: string; session: string; phase: Phase; cut: number; standing: number; ai: AiState; candidates: CandidateRow[]; suggestions: SuggestionGroup[]; wall: WallLens[] };
export function stateOf(value: unknown): CandidatesState | null {
  const r = record(value);
  if (r.status !== "ok" || !isUuid(r.session)) return null;
  const ai = record(r.ai), kind = (x: unknown) => x === "rename" || x === "merge" ? x : "add";
  return {
    status: "ok", session: String(r.session), phase: phases.includes(r.phase as Phase) ? r.phase as Phase : "review", cut: cutRange.includes(int(r.cut) as 4) ? int(r.cut) : 5, standing: int(r.standing),
    ai: { engagement_on: ai.engagement_on === true, on: ai.on === true, requested: ai.requested === true, running: ai.running === true, failing: ai.failing === true,
      drafted_at: typeof ai.drafted_at === "string" ? ai.drafted_at : null, note: ai.note === "no_sentences" || ai.note === "short" || ai.note === "empty" ? ai.note : null },
    candidates: list(r.candidates).flatMap(value => { const c = record(value); return isUuid(c.id) ? [{ id: String(c.id), num: int(c.num), name: clean(c.name), origin: c.origin === "ai" || c.origin === "phone" ? c.origin : "facilitator" as const, edited: c.edited === true, from: int(c.from), marked: c.marked === true,
      sources: list(c.sources).flatMap(s => { const x = record(s); return isUuid(x.id) ? [{ id: String(x.id), lens: int(x.lens), text: clean(x.text) }] : []; }) }] : []; }),
    suggestions: list(r.suggestions).flatMap(value => { const g = record(value), ids = list(g.ids).filter(isUuid).map(String);
      return ids.length ? [{ ids, kind: kind(g.kind), candidate: isUuid(g.candidate) ? String(g.candidate) : null, candidate_name: clean(g.candidate_name) || null, into: isUuid(g.into) ? String(g.into) : null, into_name: clean(g.into_name) || null,
        text: clean(g.text), count: ids.length, by: list(g.by).map(clean).filter(Boolean) }] : []; }),
    wall: list(record(r.wall).lenses).map(value => { const l = record(value); return { lens: int(l.lens), name: clean(l.name), open: l.open === true, loose: int(l.loose),
      clusters: list(l.clusters).map(c => { const x = record(c); return { label: clean(x.label), count: int(x.count), sentences: list(x.sentences).flatMap(s => { const y = record(s); return isUuid(y.id) ? [{ id: String(y.id), text: clean(y.text) }] : []; }) }; }) }; }),
  };
}
// "Rename 'Welcome' to 'Open doors'", for the suggestion list. Short, plain, verb first.
export function suggestionLine(g: SuggestionGroup): string {
  if (g.kind === "add") return `Add “${g.text}”`;
  if (g.kind === "rename") return `Rename “${g.candidate_name ?? "a candidate"}” to “${g.text}”`;
  return `Merge “${g.candidate_name ?? "a candidate"}” into “${g.into_name ?? "another"}”${g.text ? ` as “${g.text}”` : ""}`;
}
export const sentenceCount = (n: number) => `${n} ${n === 1 ? "sentence" : "sentences"}`;
// A mark outside 4 to 6 is allowed, with a plain warning.
export const markWarning = (n: number) => n < 4 ? `That is ${n} marked. The usual range is 4 to 6.` : n > 6 ? `That is ${n} marked. The usual range is 4 to 6.` : "";

export const pressMessages: Record<string, string> = {
  moved: "The room moved on. Check what is live and try again.", invalid_state: "That can’t be done at this point.", missing: "That is no longer there.",
  denied: "Only facilitators can do that.", unavailable: "The room didn’t answer. Try again.", closed: "This engagement has closed.",
  invalid_request: "That didn’t go through. Check it and try again.", invalid_answer: "Check the words and try again.", filtered: "Please use different words.",
  exists: "A candidate with that name is already on the list.", full: "There are twelve candidates, the most the list holds.", unchanged: "Nothing changed.", ai_off: "AI is off for this step. Write the candidates yourself.",
  too_few: "Keep at least two candidates first.", too_many: "The 100 points hold eight candidates at most. Merge or remove some first.",
  has_points: "People have already placed points. Keep the candidates as they are.", no_points: "No one has placed points yet. Choose which candidates to mark.", locked: "A Vision Outcome from this step is already confirmed.",
  limit: "That’s six suggestions from you. Wait for the facilitator.",
};

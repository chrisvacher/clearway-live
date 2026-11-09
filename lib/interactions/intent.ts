// INT-16 Commander's intent, and the remote changing hands (D2-11). The rules the database
// holds live in supabase/migrations/20261104140000_handover_intent.sql; this file is how the
// TV, the phones and the routes read and shape them, so a screen and a route never disagree.

export const intentFieldKeys = ["intent", "must_do", "what_we_stop"] as const;
export type IntentField = typeof intentFieldKeys[number];
export type IntentStep = { id: string; text: string; owner: string | null; date: string | null; missing: ("owner" | "date")[]; typing?: boolean };
export type IntentCard = {
  id: string; number: number; title: string; intent: string; must_do: string; what_we_stop: string;
  steps: IntentStep[]; flagged: number; filled: number; pair: number; typing: IntentField[];
};

// A field is locked to one phone while someone types in it and is released after this
// many idle milliseconds (cwl-dur-field-lock). The database holds the same 3 seconds.
export const fieldLockMs = 3000;
export const maxFieldLength = 400;
export const maxStepLength = 280;
export const maxSteps = 12;
export const maxPeople = 3;

export const intentFields: { key: IntentField; label: string; ask: (year: number | null) => string }[] = [
  { key: "intent", label: "Commander's intent", ask: year => `What must be true ${year ? `by ${year}` : "by the end of the 3-year Vision"}, even if every plan changes?` },
  { key: "must_do", label: "The must-do", ask: () => "What is the one thing we cannot fail to do?" },
  { key: "what_we_stop", label: "What we'll stop", ask: () => "What are we giving up to make room for this?" },
];

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown) => typeof v === "string" ? v : "";
function step(value: unknown): IntentStep | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const missing = Array.isArray(value.missing) ? value.missing.filter((m): m is "owner" | "date" => m === "owner" || m === "date") : [];
  return { id: value.id, text: text(value.text), owner: typeof value.owner === "string" && value.owner ? value.owner : null, date: typeof value.date === "string" ? value.date : null, missing, typing: value.typing === true };
}
// The cards in a frame's results, in the order of the Vision Outcomes. Anything malformed is left out.
export function cardsOf(results: unknown): IntentCard[] {
  const list = isRecord(results) && Array.isArray(results.cards) ? results.cards : [];
  return list.flatMap((value): IntentCard[] => {
    if (!isRecord(value) || typeof value.id !== "string") return [];
    const steps = (Array.isArray(value.steps) ? value.steps : []).map(step).filter((s): s is IntentStep => s !== null);
    const typing = (Array.isArray(value.typing) ? value.typing : []).filter((f): f is IntentField => (intentFieldKeys as readonly unknown[]).includes(f));
    return [{ id: value.id, number: Number(value.number) || 0, title: text(value.title), intent: text(value.intent), must_do: text(value.must_do), what_we_stop: text(value.what_we_stop),
      steps, flagged: steps.filter(s => s.missing.length).length, filled: Number(value.filled) || 0, pair: Number(value.pair) || 0, typing }];
  });
}

// A first step needs one owner and a date. This is the same rule the database applies
// (private.first_step_flags); the screens only word it.
export const stepMissing = (s: Pick<IntentStep, "owner" | "date">): ("owner" | "date")[] => [...(s.owner ? [] : ["owner" as const]), ...(s.date ? [] : ["date" as const])];
export function needsText(missing: readonly ("owner" | "date")[]) {
  return missing.length === 2 ? "Needs an owner and a date" : missing[0] === "owner" ? "Needs an owner" : missing[0] === "date" ? "Needs a date" : "";
}
// The card's one-line summary of its flagged steps.
export function cardNeeds(steps: readonly Pick<IntentStep, "owner" | "date" | "missing">[]) {
  const bad = steps.filter(s => s.missing.length);
  if (!bad.length) return "";
  if (bad.length > 1) return "Steps need owners or dates";
  return bad[0].missing.length === 2 ? "Needs owner and date" : bad[0].missing[0] === "owner" ? "Step needs an owner" : "Step needs a date";
}

// How a line on the TV changes: typing grows or trims it in place; a rewrite crossfades.
export type LineChange = "same" | "new" | "typing" | "rewrite";
export function lineChange(old: string, next: string): LineChange {
  if (old === next) return "same";
  if (!old) return "new";
  return next.startsWith(old) || old.startsWith(next) ? "typing" : "rewrite";
}
export const shortDate = (iso: string | null) => {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return "";
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m[2]) - 1] ?? ""} ${Number(m[3])}`;
};

// ---------- What each caller may press ----------
// The team remote shows these and nothing else (pass 4b FollowUpScope). The database holds
// the same list in private.room_control; a press outside it is refused there.
export const teamPresses = ["go_live", "next", "back", "reopen", "phones_down", "open_phones", "spotlight", "clear_spotlight", "hide", "unhide", "room_size"] as const;
export const teamIntentPresses = ["intent_assign", "intent_auto", "intent_clear", "intent_present"] as const;
// Filling the Affirm together text from the cards is the facilitator's alone (the database refuses everyone else).
export const facilitatorIntentPresses = ["intent_affirm_text"] as const;
export const isTeamPress = (action: unknown): boolean => (teamPresses as readonly unknown[]).includes(action) || (teamIntentPresses as readonly unknown[]).includes(action);

// ---------- Requests from a phone ----------
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isId = (v: unknown): v is string => typeof v === "string" && uuidPattern.test(v);
export type PhoneIntent =
  | { rpc: "intent_edit"; args: { p_card: string; p_op: string; p: Record<string, unknown> } }
  | { rpc: "intent_join" | "intent_leave"; args: { p_card: string } }
  | { rpc: "room_control" | "intent_control"; args: { p_id: string; p_action: string; p: Record<string, unknown> } };
const editOps = ["set", "step_add", "step_set", "step_remove", "release"];
export function phoneIntent(value: unknown, facilitator = false): PhoneIntent | null {
  if (!isRecord(value)) return null;
  if (value.kind === "join" || value.kind === "leave") return isId(value.card) ? { rpc: value.kind === "join" ? "intent_join" : "intent_leave", args: { p_card: value.card } } : null;
  if (value.kind === "edit") {
    if (!isId(value.card) || typeof value.op !== "string" || !editOps.includes(value.op) || !isRecord(value.p)) return null;
    const p = value.p;
    if (value.op === "set" && (!(intentFieldKeys as readonly unknown[]).includes(p.field) || typeof p.text !== "string" || p.text.length > maxFieldLength)) return null;
    if (value.op === "release" && typeof p.field !== "string") return null;
    if ((value.op === "step_add" || (value.op === "step_set" && "text" in p)) && (typeof p.text !== "string" || p.text.length > maxStepLength)) return null;
    if ((value.op === "step_set" || value.op === "step_remove") && !isId(p.step)) return null;
    return { rpc: "intent_edit", args: { p_card: value.card, p_op: value.op, p } };
  }
  if (value.kind === "press" && facilitator && (facilitatorIntentPresses as readonly unknown[]).includes(value.action)) {
    if (!isId(value.id) || !isRecord(value.p) || !isId(value.p.session)) return null;
    return { rpc: "intent_control", args: { p_id: value.id, p_action: "affirm_text", p: { session: value.p.session } } };
  }
  if (value.kind === "press") {
    // The holder's presses. The database refuses anything the holder is not allowed to press.
    if (!isId(value.id) || typeof value.action !== "string" || !isTeamPress(value.action) || !isRecord(value.p)) return null;
    if (value.p.from !== null && !isId(value.p.from)) return null;
    const intent = value.action.startsWith("intent_");
    return { rpc: intent ? "intent_control" : "room_control", args: { p_id: value.id, p_action: intent ? value.action.slice(7) : value.action, p: value.p } };
  }
  return null;
}

// ---------- Follow-up access ----------
// The link and code the lead issues for the video follow-up. The link names the access, the
// code proves the person; neither is ever stored, only their hashes.
export const normalizeCode = (value: unknown) => typeof value === "string" ? value.toUpperCase().replace(/[\s-]/g, "") : "";
export const validCode = (value: string) => /^[A-Z]{5}[0-9]{4}$/.test(value);
export const showCode = (code: string) => `${code.slice(0, 5)} ${code.slice(5)}`;
// The window: from an hour before the first step to two hours after the last.
export function followupWindow(firstStart: Date, lastEnd: Date) {
  return { opens: new Date(firstStart.getTime() - 3600_000), closes: new Date(lastEnd.getTime() + 2 * 3600_000) };
}
export type FollowupState = "none" | "issued" | "paired" | "expiring" | "expired" | "revoked";
export const followupLabels: Record<FollowupState, string> = {
  none: "Not issued", issued: "Issued, waiting", paired: "Paired", expiring: "Ending soon", expired: "Ended", revoked: "Revoked",
};
export const followupStatusText: Record<string, string> = {
  invalid: "That link isn't valid. Ask for a new one.", wrong: "That code doesn't match.", locked: "Too many tries. Try again in 10 minutes, or ask for the code again.",
  revoked: "This access was turned off.", ended: "This follow-up has ended.", before: "This follow-up hasn't opened yet.", denied: "That didn't work. Enter the code again.",
  unavailable: "The room didn't answer. Try again.", limited: "Too many tries. Wait a moment.", busy: "The room's own handover is still open. Ask the lead facilitator to end it.",
  lead_has_it: "The lead facilitator has the remote. Ask for it back.", outside_block: "That is outside your block.",
};
// What the lead's Video follow-up panel says when the server refuses Issue link and code or Extend. Each
// refusal has its own line, so a window the server will never accept doesn't read as a dead room.
export const followupManageText: Record<string, string> = {
  invalid_window: "That window won't work. It has to end in the future, open before it ends and run no longer than 24 hours. Set it to cover the scheduled times of the follow-up steps.",
  invalid_request: "Pick the steps, a team facilitator and when the link opens and ends, then try again.",
  limit: "A follow-up can run 24 hours at most, so it can't be extended again.",
  closed: "This engagement is closed, so no follow-up can be issued.",
};
// What the follow-up phone says when Take the remote does not go through. Busy means the room's own handover,
// given to someone else in the room, is still open: only the lead can end it.
export function followupTakeText(status: string, lead?: string | null): string {
  if (status === "busy") return `The room’s own handover is still open. Ask ${lead?.trim() || "the lead facilitator"} to end it.`;
  if (status === "lead_has_it" && lead?.trim()) return `${lead.trim()} has the remote. Ask for it back.`;
  return followupStatusText[status] ?? followupStatusText.unavailable;
}

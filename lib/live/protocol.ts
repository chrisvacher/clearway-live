import type { LiveEvent, LiveSnapshot, SubmissionRequest } from "./types";

// State and its anonymous answer patch share one version and one committed event.
export function applyLiveEvent(current: LiveSnapshot, event: LiveEvent): { kind: "same" | "snapshot" | "applied"; value: LiveSnapshot } {
  const version = event?.state?.version;
  if (!Number.isSafeInteger(version) || event.state.engagement_id !== current.state.engagement_id) return { kind: "snapshot", value: current };
  if (version <= current.version) return { kind: "same", value: current };
  if (version !== current.version + 1 || event.state.live_session_id !== current.state.live_session_id) return { kind: "snapshot", value: current };
  // A content revision also covers private phone depth. Fetch its guarded snapshot
  // before advancing a phone; depth never travels on the shared TV channel.
  if (current.role === "participant" && (event.session?.revision !== current.session?.revision || event.session?.base_year !== current.session?.base_year)) return { kind: "snapshot", value: current };
  const answers = new Map(current.answers.map(answer => [answer.id, answer]));
  const hidden = Array.isArray(event.state.hidden_ids) ? event.state.hidden_ids : [];
  for (const id of hidden) answers.delete(id);
  const patch = event.answer;
  if (patch && patch.session_id === event.state.live_session_id) {
    if (patch.withdrawn || patch.hidden) answers.delete(patch.id);
    else answers.set(patch.id, { id: patch.id, session_id: patch.session_id, text: patch.text, answers: patch.answers, revision: patch.revision });
  }
  return { kind: "applied", value: { ...current, state: event.state, session: event.session, answers: [...answers.values()], version } };
}

export function adoptSnapshot(current: LiveSnapshot | null, next: LiveSnapshot) {
  return current && (next.state.engagement_id !== current.state.engagement_id || next.version <= current.version) ? current : next;
}
export const snapshotDelay = (connected: boolean) => connected ? 5000 : 1500;
export function retryDelay(attempt: number, random = Math.random) {
  return Math.round(Math.min(30000, 500 * 2 ** Math.min(attempt, 6)) * (0.75 + 0.5 * random()));
}
// Cross-device wall-clock comparisons need a measured offset and uncertainty.
export function clockSample(sent: number, received: number, serverTime: number) {
  if (![sent, received, serverTime].every(Number.isFinite) || received < sent) throw new Error("Invalid clock sample");
  return { offsetMs: serverTime - (sent + received) / 2, uncertaintyMs: (received - sent) / 2 };
}
export function submissionRequest(value: Record<string, unknown>): SubmissionRequest | null {
  const uuid = (x: unknown) => typeof x === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x);
  const date = (x: unknown) => typeof x === "string" && x.length <= 40 && Number.isFinite(Date.parse(x));
  if (!uuid(value.id) || !uuid(value.session) || !Number.isInteger(value.revision) || Number(value.revision) < 0 || Number(value.revision) > 1000000
    || !["submit", "change", "withdraw"].includes(String(value.action)) || typeof value.text !== "string" || value.text.length > 1404
    || (value.action !== "withdraw" && !value.text.trim()) || !date(value.sentAt) || (value.queuedAt !== undefined && !date(value.queuedAt))
    || (value.uncertaintyMs !== undefined && (typeof value.uncertaintyMs !== "number" || !Number.isFinite(value.uncertaintyMs) || value.uncertaintyMs < 0 || value.uncertaintyMs > 60000))) return null;
  return value as SubmissionRequest;
}

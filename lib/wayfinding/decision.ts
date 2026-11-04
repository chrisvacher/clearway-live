import { uuid } from "../room/identity";

// Mark a decision: the room's consensus decision and its reasons, written by the facilitator.
// Counts and votes show where the room is; only this records the decision.
export const decisionSubjects = ["step", "lens_summary", "outcome", "candidate", "cut_line", "goal", "intent", "other"] as const;
export type DecisionSubject = typeof decisionSubjects[number];
export type DecisionMark = { id: string; decision: string; reasons: string; label: string; subject: DecisionSubject; subject_id?: string };
export type Decision = { id: string; session_id: string | null; session_title: string | null; subject: DecisionSubject; subject_id: string | null; label: string; decision: string; reasons: string; by: string; marked_at: string };

const squash = (value: string) => value.replace(/\s+/g, " ").trim();
export function decisionBody(value: unknown): DecisionMark | null {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== "object" || Array.isArray(v) || !uuid(v.id) || typeof v.decision !== "string") return null;
  const decision = squash(v.decision), reasons = typeof v.reasons === "string" ? v.reasons.trim() : "", label = typeof v.label === "string" ? squash(v.label) : "";
  const subject = v.subject === undefined ? "step" : v.subject;
  if (!decision || [...decision].length > 400 || [...reasons].length > 1000 || [...label].length > 200) return null;
  if (!decisionSubjects.includes(subject as DecisionSubject)) return null;
  if (v.subject_id !== undefined && !uuid(v.subject_id)) return null;
  return { id: String(v.id).toLowerCase(), decision, reasons, label, subject: subject as DecisionSubject, ...(v.subject_id ? { subject_id: String(v.subject_id).toLowerCase() } : {}) };
}

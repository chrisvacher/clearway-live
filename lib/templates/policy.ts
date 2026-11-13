import { uuid } from "../room/identity";
import type { Template } from "./types";

// What the templates API accepts. The database checks access and every session again.
export type TemplateAction =
  | { action: "save"; input: { engagement: string; name: string; description: string; shared: boolean; sessions?: string[] } }
  | { action: "apply"; input: { template: string; engagement: string; start: string | null } }
  | { action: "remove"; input: { template: string } };

export function templateInput(body: Record<string, unknown>): TemplateAction {
  const v = body.input && typeof body.input === "object" && !Array.isArray(body.input) ? body.input as Record<string, unknown> : {};
  if (body.action === "save") {
    const name = typeof v.name === "string" ? v.name.replace(/\s+/g, " ").trim() : "";
    if (!uuid(v.engagement)) throw new Error("Reload the run of show and try again.");
    if (!name || [...name].length > 120) throw new Error("Give the template a name of up to 120 characters.");
    const description = typeof v.description === "string" ? v.description.trim() : "";
    if ([...description].length > 500) throw new Error("Keep the description to 500 characters.");
    if (v.shared !== undefined && typeof v.shared !== "boolean") throw new Error("Choose whether to share the template.");
    // A saved block (design pass 8, step 5) is a template made from some of the run's sessions.
    if (v.sessions !== undefined && (!Array.isArray(v.sessions) || !v.sessions.length || v.sessions.length > 500 || v.sessions.some(x => !uuid(x)) || new Set(v.sessions).size !== v.sessions.length)) throw new Error("Reload the run of show and try again.");
    return { action: "save", input: { engagement: v.engagement, name, description, shared: v.shared !== false, ...(v.sessions ? { sessions: v.sessions as string[] } : {}) } };
  }
  if (body.action === "apply") {
    if (!uuid(v.template) || !uuid(v.engagement)) throw new Error("Choose a template and an engagement.");
    let start: string | null = null;
    if (v.start !== null && v.start !== undefined && v.start !== "") {
      if (typeof v.start !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:\d\d)$/.test(v.start) || !Number.isFinite(Date.parse(v.start))) throw new Error("Check the start time.");
      start = new Date(v.start).toISOString();
    }
    return { action: "apply", input: { template: v.template, engagement: v.engagement, start } };
  }
  if (body.action === "remove") {
    if (!uuid(v.template)) throw new Error("Choose a template.");
    return { action: "remove", input: { template: v.template } };
  }
  throw new Error("Choose a template action.");
}

export const templateMessages: Record<string, string> = {
  denied: "Your access has changed. Sign in again to continue.", missing: "That template is no longer available. Reload the library.",
  closed: "This engagement has closed. Reopen it in setup first.", empty: "Add a session to the run of show before saving it as a template.",
  too_large: "A template holds up to 500 sessions.", invalid_request: "That template doesn't fit this engagement. Check its sessions and try again.",
  unavailable: "We couldn’t finish that. Please try again.",
};

// The question Remove template asks inside the panel. The name is the template's own, so the question
// never adds the word "template" after it (a template named "Retreat template" would read twice).
export const removeTemplateQuestion = (name: string) => `Remove ${name}? Engagements already started from it keep their sessions.`;

// The line under a template's name in the library. Every part is its own piece, joined with a separator, so a name, a person
// and a date never run together; a part that is missing or isn't a date is left out.
export function templateByline(t: Pick<Template, "kind" | "mine" | "by" | "created_at">, timeZone?: string): string {
  if (t.kind === "shipped") return "Ships with the app";
  const time = Date.parse(t.created_at), date = Number.isFinite(time) ? new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone }).format(time) : "";
  return [`Saved by ${t.mine ? "you" : t.by?.trim() || "a Clearway facilitator"}`, date].filter(Boolean).join(" · ");
}

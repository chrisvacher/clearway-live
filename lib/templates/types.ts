// Templates (SET-08): a template is a saved run of show. The library lists what ships with
// the app, what the Clearway team shares, and the facilitator's own.
import type { InteractionKind } from "../interactions/kinds";
import type { Part } from "../run-of-show/types";

export type TemplateSession = { title: string; part: Part; interaction: InteractionKind; screen: string | null; planned_minutes: number; mode: "live" | "self_paced"; state: string };
export type Template = {
  // A saved block: some of a run's sessions, added to a run rather than starting one (design pass 8, step 5).
  block?: boolean;
  id: string; name: string; description: string; kind: "shipped" | "saved"; shared: boolean; mine: boolean; can_remove: boolean;
  by: string | null; created_at: string; count: number; minutes: number; sessions: TemplateSession[];
};
export type TemplateEngagement = { id: string; title: string; church: string; timezone: string; type: string; sessions: number };
export type TemplateLibrary = { templates: Template[]; engagements: TemplateEngagement[] };

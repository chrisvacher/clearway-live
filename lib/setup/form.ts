import { consensus, localTime } from "./policy";
import { skinOf } from "../brand";
import type { EngagementForm, SetupForm } from "./types";

// The Details form for an engagement, built from its rows: what the Details page shows and what any action that saves the engagement
// through save_engagement starts from, so a change to one field leaves every other field as it is.
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export function setupFormFromRows(e: Row, c: Row, assignments: { clearway_user_id: string; role: string }[] | null): SetupForm {
  const settings = (e.settings ?? {}) as Partial<EngagementForm["settings"]>;
  return {
    church: { name: c.name, timezone: c.timezone, logo_url: c.logo_url || "", mission: c.mission, purpose: c.purpose, values: c.values.join("\n"), strategy: c.strategy, leadership_rhythms: c.leadership_rhythms.join("\n"), governance_body_name: c.governance_body_name },
    engagement: { title: e.title, type: e.type, status: e.status, start_date: e.start_date || "", end_date: e.end_date || "", retreat_start_date: e.retreat_start_date || "", retreat_end_date: e.retreat_end_date || "", pre_call_local: localTime(e.pre_call_at, c.timezone), base_year: String(e.base_year), lens_names: e.lens_names, how_the_room_decides: e.how_the_room_decides || consensus, skin: skinOf(e.skin),
      settings: { neutral_join_message: settings.neutral_join_message === true, ai_enabled: settings.ai_enabled === true, scripture_translation: settings.scripture_translation || "", tv_theme: settings.tv_theme || "dark", texture: settings.texture !== false, room_size: settings.room_size || "very_small", open_join: settings.open_join === true } },
    lead: assignments?.find(f => f.role === "lead")?.clearway_user_id || "", co: assignments?.find(f => f.role === "co_facilitator")?.clearway_user_id || "",
    hub_client: e.team_hub_client_id || "", hub_engagement: e.team_hub_engagement_id || "",
  };
}

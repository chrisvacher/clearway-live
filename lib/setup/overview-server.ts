import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "@/lib/server/read-all";
import { teamHubConfigured, teamHubReader } from "@/lib/server/team-hub";
import type { HubPlace } from "@/lib/setup/listing";

export type OverviewFacts = {
  stepCount: number; draftCount: number; minutes: number; attendeeCount: number; screenCount: number;
  liveSessionId: string | null; firstPlanned: string | null; lastPlanned: string | null;
};

export const readArchiveCapability = cache(async (client: SupabaseClient) => {
  const { error } = await client.from("engagements").select("archived_at").limit(0);
  return !error;
});

export const readOverviewFacts = cache(async (client: SupabaseClient, id: string): Promise<OverviewFacts> => {
  const [steps, attendees, room, tv] = await Promise.all([
    readAll(after => {
      const query = client.from("sessions").select("id,planned_start,planned_minutes,state")
        .eq("engagement_id", id).eq("deleted", false).order("id").limit(500);
      return after ? query.gt("id", after) : query;
    }).catch(() => []),
    client.from("attendees").select("id", { count: "exact", head: true }).eq("engagement_id", id).eq("deleted", false),
    client.from("room_states").select("live_session_id").eq("engagement_id", id).eq("deleted", false).maybeSingle(),
    client.rpc("tv_manage", { p_engagement: id, p_action: "list", p: {} }),
  ]);
  let firstPlanned: string | null = null, lastPlanned: string | null = null;
  for (const step of steps) {
    if (!step.planned_start) continue;
    if (!firstPlanned || step.planned_start < firstPlanned) firstPlanned = step.planned_start;
    const end = new Date(Date.parse(step.planned_start) + step.planned_minutes * 60_000).toISOString();
    if (!lastPlanned || Date.parse(end) > Date.parse(lastPlanned)) lastPlanned = end;
  }
  return {
    stepCount: steps.length,
    draftCount: steps.filter(step => step.state === "draft").length,
    minutes: steps.reduce((sum, step) => sum + step.planned_minutes, 0),
    attendeeCount: attendees.count ?? 0,
    screenCount: ((tv.data as { screens?: unknown[] } | null)?.screens ?? []).length,
    liveSessionId: room.data?.live_session_id ?? null,
    firstPlanned,
    lastPlanned,
  };
});

export const readEngagementCreationCapability = cache(async (client: SupabaseClient) => {
  const { error } = await client.rpc("engagement_link_name_status", { p_name: "", p_engagement: null });
  return !error;
});

export async function teamHubPlaces(ids: readonly (string | null)[]): Promise<Map<string, HubPlace>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (!unique.length || !teamHubConfigured()) return new Map();
  try {
    return new Map((await teamHubReader().clients(unique)).map(item => [item.id, item]));
  } catch {
    return new Map();
  }
}

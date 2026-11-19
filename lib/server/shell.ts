import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShellData, ShellEngagement } from "@/components/layout/shell-nav";
import { brandFor, skinOf } from "@/lib/brand";
import { compareEngagements, eventDate, listGroup, type ListedEngagement } from "@/lib/setup/listing";
import { overviewReadiness } from "@/lib/setup/overview";
import { stageFor } from "@/lib/setup/stage";

const engagementColumns = "id,title,type,status,skin,room_code,link_name,start_date,end_date,retreat_start_date,retreat_end_date,pre_call_at,church:churches!engagements_church_id_fkey(name,timezone)";
type ShellRow = ListedEngagement & { skin: string | null; room_code: string; link_name: string | null; archived_at?: string | null };

async function readNavigationRows(client: SupabaseClient) {
  const { readAll } = await import("./read-all");
  const rows = (columns: string) => readAll(async after => {
    const query = client.from("engagements").select(columns).eq("deleted", false).order("id").limit(500);
    const { data, error } = await (after ? query.gt("id", after) : query);
    return { data: data as unknown as ShellRow[] | null, error };
  });

  try {
    return await rows(`${engagementColumns},archived_at`);
  } catch {
    // Older deployments keep the switcher available until archive support is applied.
    try { return await rows(engagementColumns); } catch { return []; }
  }
}

async function readOperationsGroups(client: SupabaseClient) {
  const { data } = await client.rpc("ops_state");
  if (data?.status !== "ok") return [];
  const latest = new Map<string, string>();
  const errors = data.errors as { last_seen: string; event: { route: string; name: string } }[] | undefined;
  for (const { last_seen, event } of errors ?? []) {
    const key = JSON.stringify([event.route, event.name]);
    if (last_seen > (latest.get(key) ?? "")) latest.set(key, last_seen);
  }
  return [...latest.values()];
}

// Read with the facilitator's own session, including event-link guests, so the only
// rooms sent to the browser are the ones the existing engagement policy allows.
export async function readShellData(client: SupabaseClient, profile: { id: string; is_admin: boolean; kind: string }): Promise<ShellData> {
  const [rows, operationsGroups] = await Promise.all([
    readNavigationRows(client),
    profile.is_admin ? readOperationsGroups(client) : [],
  ]);
  const now = new Date();
  rows.sort((a, b) => compareEngagements(a, b, now));
  const entries = rows.map(row => {
    const brand = brandFor(skinOf(row.skin));
    const name = row.link_name ?? row.room_code;
    return {
      id: row.id, title: row.title, church: row.church?.name ?? "Church not named", type: row.type,
      upcoming: !row.archived_at && listGroup(row, now) === "upcoming",
      date: eventDate(row, row.church?.timezone), linkName: name,
      roomLink: `${brand.origin}/${name}`, canOpenTv: row.status !== "closed",
    };
  });
  return {
    entries, operationsGroups, profileId: profile.id,
    admin: profile.is_admin, eventOnly: profile.kind === "link_guest",
  };
}

// The stage chip needs readiness only for the engagement currently open.
export const readShellEngagement = cache(async (client: SupabaseClient, id: string): Promise<ShellEngagement | null> => {
  const { data } = await client.from("engagements").select(`${engagementColumns},settings`).eq("id", id).eq("deleted", false).maybeSingle();
  if (!data) return null;
  const row = data as unknown as ShellRow & { settings: { open_join?: boolean } | null };
  const workshop = row.type === "team_workshop";
  const [stage, fourLists] = workshop
    ? [await readWorkshopStage(client, row), false] as const
    : [stageFor(row, []), await hasFourLists(client, id)] as const;
  return {
    id, title: row.title, type: row.type, church: row.church?.name ?? "Church not named",
    brand: brandFor(skinOf(row.skin)).label, stage, fourLists,
  };
});

async function readWorkshopStage(client: SupabaseClient, row: ShellRow & { settings: { open_join?: boolean } | null }) {
  if (row.status === "closed") return stageFor(row, []);
  const stepQuery = () => client.from("sessions").select("id", { count: "exact", head: true }).eq("engagement_id", row.id).eq("deleted", false);
  const openJoin = row.settings?.open_join === true;
  const [steps, drafts, people, tv, room] = await Promise.all([
    stepQuery(), stepQuery().eq("state", "draft"),
    openJoin ? null : client.from("attendees").select("id", { count: "exact", head: true }).eq("engagement_id", row.id).eq("deleted", false),
    client.rpc("tv_manage", { p_engagement: row.id, p_action: "list", p: {} }),
    client.from("room_states").select("live_session_id").eq("engagement_id", row.id).maybeSingle(),
  ]);
  const readiness = overviewReadiness({
    hasDate: Boolean(eventDate(row, row.church?.timezone)),
    stepCount: steps.count ?? 0,
    draftCount: drafts.error ? 1 : drafts.count ?? 0,
    openJoin,
    attendeeCount: people?.count ?? 0,
    screenCount: tv.data?.screens?.length ?? 0,
  });
  return stageFor(row, readiness, room.data);
}

// One indexed existence read. If it fails, the sidebar still offers the page.
export async function hasFourLists(client: SupabaseClient, id: string): Promise<boolean> {
  try {
    const { data, error } = await client.from("sessions").select("id").eq("engagement_id", id).eq("interaction", "four_lists").eq("deleted", false).limit(1);
    return error ? true : (data ?? []).length > 0;
  } catch { return true; }
}

// A workshop has no Wayfinding pages. Route it to the corresponding workshop surface.
export async function wayfindingOnly(client: SupabaseClient, id: string, instead: string) {
  const { data } = await client.from("engagements").select("type").eq("id", id).eq("deleted", false).maybeSingle();
  if (data?.type === "team_workshop") redirect(instead);
}

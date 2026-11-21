import type { Metadata } from "next";
import { requireFacilitator } from "@/lib/server/facilitator";
import { brandFor, skinOf } from "@/lib/brand";
import { listGroup, place, type ListedEngagement } from "@/lib/setup/listing";
import { dayInZone, eventDayOffset, overviewReadiness, roomTime } from "@/lib/setup/overview";
import { teamHubPlaces, readArchiveCapability, readEngagementCreationCapability, readOverviewFacts } from "@/lib/setup/overview-server";
import { stageFor } from "@/lib/setup/stage";
import { EngagementsTable, type EngagementTableRow } from "@/components/facilitator/engagements-table";

export const metadata: Metadata = { title: "Engagements" };

const columns = "id,title,type,status,settings,room_code,link_name,skin,start_date,end_date,retreat_start_date,retreat_end_date,pre_call_at,team_hub_client_id,church:churches!engagements_church_id_fkey(name,timezone),sessions(count)";
type Listing = ListedEngagement & { room_code: string; link_name: string | null; skin: string; archived_at?: string; settings?: { open_join?: boolean }; sessions?: { count: number }[] };

function dateBlock(day: string | null): EngagementTableRow["date"] {
  if (!day) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", month: "short", day: "numeric", weekday: "short" })
    .formatToParts(new Date(`${day}T12:00:00Z`));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value.replace(/\./g, "")]));
  return { month: values.month, day: values.day, weekday: values.weekday };
}

export default async function EngagementsPage() {
  const { profile, client } = await requireFacilitator();
  const [archiveAvailable, creationAvailable] = await Promise.all([
    readArchiveCapability(client), profile.is_admin ? readEngagementCreationCapability(client) : false,
  ]);
  const selected = archiveAvailable ? `${columns},archived_at` : columns;
  const { data, error } = await client.from("engagements").select(selected)
    .eq("deleted", false).eq("sessions.deleted", false).order("created_at", { ascending: false }).order("id");
  const engagements = (data ?? []) as unknown as Listing[];
  const where = await teamHubPlaces(engagements.map(event => event.team_hub_client_id));
  const rows: EngagementTableRow[] = [];
  const now = new Date();
  // Keep the number of parallel room reads bounded when a workspace has a large history.
  for (let offset = 0; offset < engagements.length; offset += 10) {
    rows.push(...await Promise.all(engagements.slice(offset, offset + 10).map(async event => {
      const zone = event.church?.timezone ?? "America/Toronto";
      const day = (event.type !== "team_workshop" && event.retreat_start_date) || event.start_date ||
        (event.pre_call_at ? dayInZone(new Date(event.pre_call_at), zone) : null);
      const delta = eventDayOffset(day, zone, now);
      const brand = brandFor(skinOf(event.skin));
      const group: EngagementTableRow["group"] = event.archived_at ? "archived" : listGroup(event, now);
      const facts = event.type === "team_workshop" && event.status !== "closed" && group !== "archived"
        ? await readOverviewFacts(client, event.id) : null;
      const readiness = facts ? overviewReadiness({ ...facts, hasDate: !!day, openJoin: event.settings?.open_join === true }) : [];
      const stage = stageFor(event, readiness, { live_session_id: facts?.liveSessionId });
      const stageNote = delta === 0 ? "Today" : stage === "ready" && delta === 1
        ? `Tomorrow${facts?.firstPlanned ? `, ${roomTime(facts.firstPlanned, zone)}` : ""}`
        : readiness.length ? `${readiness.filter(item => item.state === "ready").length} of ${readiness.length} ready` : "";
      return {
        id: event.id, title: event.title, church: event.church?.name ?? "Church not named", type: event.type,
        place: event.team_hub_client_id ? place(where.get(event.team_hub_client_id)) : null,
        skin: brand.skin, brand: brand.label, group, stage, stageNote, date: dateBlock(day), soon: delta === 0 || delta === 1,
        host: brand.host, origin: brand.origin, code: event.link_name ?? event.room_code, stepCount: event.sessions?.[0]?.count ?? 0,
      };
    })));
  }

  return <main id="main" className="admin-page engagement-table-page">
    <EngagementsTable rows={rows} archiveAvailable={archiveAvailable && profile.kind === "person"} canCreate={profile.is_admin}
      canDuplicate={profile.is_admin && creationAvailable} unavailable={!!error} />
  </main>;
}

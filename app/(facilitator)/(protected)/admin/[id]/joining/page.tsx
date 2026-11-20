import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { readAll } from "@/lib/server/read-all";
import { teamHubConfigured } from "@/lib/server/team-hub";
import { uuid } from "@/lib/room/policy";
import { brandFor, roomOrigin, skinOf } from "@/lib/brand";
import { authConfig } from "@/lib/auth/policy";
import { consensus } from "@/lib/setup/policy";
import type { AttendeePresence, PeopleFilter } from "@/lib/setup/people";
import { AttendeeEditor } from "@/components/facilitator/attendee-editor";

export const metadata = { title: "People" };
export const dynamic = "force-dynamic";

const filters: readonly string[] = ["in-the-room", "invited", "duplicates"];

export default async function JoiningPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { id } = await params;
  if (!uuid(id)) notFound();
  const { client, profile } = await requireFacilitator();
  const { data: event } = await client.from("engagements")
    .select("id,type,status,room_code,link_name,skin,settings,how_the_room_decides,team_hub_client_id,team_hub_engagement_id,church:churches!engagements_church_id_fkey(name,timezone)")
    .eq("id", id).eq("deleted", false).maybeSingle();
  if (!event) notFound();
  const church = event.church as unknown as { name: string; timezone: string } | null;
  const settings = (event.settings ?? {}) as { open_join?: boolean; neutral_join_message?: boolean };
  const openJoin = event.type === "team_workshop" && settings.open_join === true;
  const [attendees, requests, roster, delegation, coFacilitators, eventLink, search] = await Promise.all([
    readAll(after => {
      const q = client.from("attendees").select("id,name,email,room_role,role_at_church,extra_fields,created_at")
        .eq("engagement_id", id).eq("deleted", false).order("id").limit(500);
      return after ? q.gt("id", after) : q;
    }),
    client.from("join_requests").select("id,name,email").eq("engagement_id", id).eq("status", "pending").eq("deleted", false).order("requested_at"),
    client.rpc("attendee_roster_presence", { p_engagement: id }),
    event.type !== "team_workshop" ? client.rpc("team_remote_state", { p_engagement: id }) : null,
    client.from("engagement_facilitators").select("person:clearway_users(email)").eq("engagement_id", id).eq("role", "co_facilitator").eq("deleted", false),
    profile.kind === "person" ? client.rpc("event_link", { p_engagement: id, p_action: "read" }) : null,
    searchParams,
  ]);
  const legacy = roster.error ? await client.rpc("room_presence", { p_engagement: id }) : null;
  const presence = (legacy?.data ?? roster.data ?? []) as AttendeePresence[];
  const config = authConfig();
  const adminLink = eventLink?.data?.status === "ok" && config
    ? { url: eventLink.data.code ? `${config.origin}/a/${eventLink.data.code}` : null } : null;
  const facilitatorEmails = (coFacilitators.data ?? []).flatMap(row => {
    const person = row.person as unknown as { email: string } | null;
    return person?.email ? [person.email] : [];
  });
  const filter = typeof search.filter === "string" && filters.includes(search.filter) ? search.filter as PeopleFilter : "all";
  const skin = skinOf(event.skin);
  return <AttendeeEditor admin={profile.is_admin} church={church?.name ?? "Church not named"} zone={church?.timezone ?? "UTC"}
    linked={Boolean(event.team_hub_client_id && event.team_hub_engagement_id) && teamHubConfigured()} initialFilter={filter}
    data={{
      attendees: attendees.sort((a, b) => a.name.localeCompare(b.name)),
      requests: requests.data ?? [], presence, mergeAvailable: !roster.error && (event.type === "team_workshop" || event.type === "practice"),
      changesAvailable: !roster.error, teamFacilitator: delegation?.data?.designee_id ?? null, facilitatorEmails,
    }}
    joining={{
      id, type: event.type, roomCode: event.room_code, linkName: event.link_name, host: brandFor(skin).host, origin: roomOrigin(skin),
      openJoin, neutral: settings.neutral_join_message === true, how: event.how_the_room_decides || consensus, closed: event.status === "closed", adminLink,
    }} />;
}

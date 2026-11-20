import { notFound } from "next/navigation";
import { SetupEditor } from "@/components/facilitator/setup-editor";
import { requireFacilitator } from "@/lib/server/facilitator";
import { teamHubConfigured } from "@/lib/server/team-hub";
import { uuid } from "@/lib/room/policy";
import { setupFormFromRows } from "@/lib/setup/form";
import { eventDate } from "@/lib/setup/listing";
import { overviewReadiness } from "@/lib/setup/overview";
import { readOverviewFacts } from "@/lib/setup/overview-server";
import { stageFor } from "@/lib/setup/stage";

export const metadata = { title: "Details" };

export default async function EditEngagement({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid(id)) notFound();
  const { client, profile } = await requireFacilitator();
  const { data: engagement } = await client.from("engagements").select("*").eq("id", id).eq("deleted", false).maybeSingle();
  if (!engagement) notFound();
  const [church, members, assignments, facts, atomicSave] = await Promise.all([
    client.from("churches").select("*").eq("id", engagement.church_id).eq("deleted", false).maybeSingle(),
    client.from("clearway_users").select("id,name,email").eq("deleted", false).eq("kind", "person").order("name"),
    client.from("engagement_facilitators").select("clearway_user_id,role,user:clearway_users!inner(kind)").eq("user.kind", "person")
      .eq("engagement_id", id).eq("deleted", false),
    engagement.type === "team_workshop" ? readOverviewFacts(client, id) : null,
    profile.kind === "person" ? client.rpc("engagement_details_patch", { p_engagement: id, p_change: {} }) : null,
  ]);
  if (!church.data) notFound();
  const initial = setupFormFromRows(engagement, church.data, assignments.data);
  const readiness = facts ? overviewReadiness({
    ...facts, hasDate: Boolean(eventDate(engagement, church.data.timezone)), openJoin: initial.engagement.settings.open_join,
  }) : [];
  const stage = stageFor(engagement, readiness, { live_session_id: facts?.liveSessionId });
  return <main id="main" className="admin-page cwl-c-details">
    <SetupEditor id={id} initial={initial} members={members.data ?? []} admin={profile.is_admin} hubConfigured={teamHubConfigured()}
      canChangeFacilitators={atomicSave?.data === "ok"} stage={stage} archiveAvailable={profile.kind === "person" && Object.hasOwn(engagement, "archived_at")} archived={Boolean(engagement.archived_at)} now={new Date().toISOString()} />
  </main>;
}

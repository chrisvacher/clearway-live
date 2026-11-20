import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { readAll } from "@/lib/server/read-all";
import { uuid } from "@/lib/room/identity";
import { readShow } from "@/lib/run-of-show/server";
import type { Recap } from "@/lib/export/recap";
import { RecapView } from "@/components/control/recap-view";

export const metadata = { title: "Results", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function RecapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid(id)) notFound();
  const { client } = await requireFacilitator();
  const [show, { data, error }, { data: engagement }, devices] = await Promise.all([
    readShow(client, id),
    client.rpc("results_recap", { p_engagement: id }),
    client.from("engagements").select("type").eq("id", id).eq("deleted", false).maybeSingle(),
    readAll(after => {
      const rows = client.from("device_sessions").select("id,attendee_id").eq("engagement_id", id).eq("deleted", false).order("id").limit(500);
      return after ? rows.gt("id", after) : rows;
    }).catch(() => []),
  ]);
  if (!show || error || !data || data.status !== "ok") notFound();
  const sections = Object.fromEntries(show.sessions.map(step => [step.id, step.section?.trim() || step.part]));
  return <div className="admin-after"><RecapView engagement={id} context={show.context} initial={data as Recap}
    people={new Set(devices.map(device => device.attendee_id)).size} sections={sections} workshop={engagement?.type === "team_workshop"} /></div>;
}

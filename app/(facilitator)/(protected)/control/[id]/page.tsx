import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { uuid } from "@/lib/room/identity";
import { readShow } from "@/lib/run-of-show/server";
import { readAll } from "@/lib/server/read-all";
import { readShellEngagement } from "@/lib/server/shell";
import { ControlSurface } from "@/components/control/control-surface";
import { DoorList } from "@/components/facilitator/door-list";

export const metadata = { title: "Live room" };
export default async function ControlRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) notFound();
  const { client } = await requireFacilitator();
  const show = await readShow(client, id); if (!show) notFound();
  const [engagement, { data: requests }, attendees] = await Promise.all([
    readShellEngagement(client, id),
    client.from("join_requests").select("id,name,email").eq("engagement_id", id).eq("status", "pending").eq("deleted", false).order("requested_at"),
    readAll(after => { const q = client.from("attendees").select("id,name,email").eq("engagement_id", id).eq("deleted", false).order("id").limit(500); return after ? q.gt("id", after) : q; }),
  ]);
  return <ControlSurface initial={show} workshop={engagement?.type === "team_workshop"} door={<DoorList engagement={id} requests={requests || []} attendees={attendees.sort((a, b) => a.name.localeCompare(b.name))} />} />;
}

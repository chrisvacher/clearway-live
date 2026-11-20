import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { uuid } from "@/lib/room/identity";
import { readShow } from "@/lib/run-of-show/server";
import { Remote } from "@/components/control/remote";

export const dynamic = "force-dynamic";
export const metadata = { title: "Remote" };
export default async function RemotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) notFound();
  const { client } = await requireFacilitator();
  const [show, { data: event }] = await Promise.all([
    readShow(client, id),
    client.from("engagements").select("type").eq("id", id).eq("deleted", false).maybeSingle(),
  ]);
  if (!show) notFound();
  return <Remote initial={show} workshop={event?.type === "team_workshop"} handover={event?.type === "wayfinding" || event?.type === "day_and_a_half"} />;
}

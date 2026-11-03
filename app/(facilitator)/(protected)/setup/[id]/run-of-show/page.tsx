import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { uuid } from "@/lib/room/identity";
import { readShow } from "@/lib/run-of-show/server";
import { ShowEditor } from "@/components/run-of-show/show-editor";

export const metadata = { title: "Run of show" };
export default async function RunOfShowPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; count?: string }> }) {
  const { id } = await params; if (!uuid(id)) notFound();
  const { from, count } = await searchParams, added = Number(count);
  const { client } = await requireFacilitator();
  const show = await readShow(client, id); if (!show) notFound();
  // Arriving from Start an engagement: say what the template added.
  const notice = from === "template" && Number.isInteger(added) && added > 0 ? `Started from the template: ${added} ${added === 1 ? "session" : "sessions"} added. Change anything you need.` : "";
  return <ShowEditor initial={show} notice={notice} />;
}

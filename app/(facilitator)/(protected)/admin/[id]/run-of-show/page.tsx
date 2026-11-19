import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { uuid } from "@/lib/room/identity";
import { readShow } from "@/lib/run-of-show/server";
import { fourListsAvailable } from "@/lib/interactions/four-lists-server";
import { readShellEngagement } from "@/lib/server/shell";
import type { TvManagerData } from "@/lib/tv/types";
import { ShowEditor } from "@/components/run-of-show/show-editor";

export const metadata = { title: "Run of show" };
export default async function RunOfShowPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; count?: string }> }) {
  const { id } = await params; if (!uuid(id)) notFound();
  const { from, count } = await searchParams, added = Number(count);
  const { client } = await requireFacilitator();
  const show = await readShow(client, id); if (!show) notFound();
  // Which image loop, if any, is the engagement's Home screen (LP-1).
  const [home, tv, fourLists, shell] = await Promise.all([
    client.rpc("home_list", { p_engagement: id }),
    client.rpc("tv_manage", { p_engagement: id, p_action: "list", p: {} }),
    fourListsAvailable(client, id),
    readShellEngagement(client, id),
  ]);
  show.context.home_session = home.data?.status === "ok" ? home.data.home ?? null : null;
  // Arriving from Start an engagement: say what the template added.
  const notice = from === "template" && Number.isInteger(added) && added > 0 ? `Started from the template: ${added} ${added === 1 ? "session" : "sessions"} added. Change anything you need.` : "";
  return <ShowEditor initial={show} notice={notice} fourLists={fourLists} shell={shell} display={(tv.data as TvManagerData | null)?.display} renderTime={new Date().toISOString()} />;
}

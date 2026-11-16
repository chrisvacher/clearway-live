import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { uuid } from "@/lib/room/identity";
import { TvManager } from "@/components/facilitator/tv-manager";
import type { TvManagerData } from "@/lib/tv/types";
export const metadata = { title: "Screens" };
export default async function TvSetup({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) notFound(); const { client } = await requireFacilitator();
  const { data, error } = await client.rpc("tv_manage", { p_engagement: id, p_action: "list", p: {} });
  if (error) throw new Error("Paired screens unavailable"); if (data.status !== "ok") notFound();
  const home = await client.rpc("home_list", { p_engagement: id });
  return <><main id="main" className="admin-page"><TvManager id={id} initial={data as TvManagerData} home={home.data?.status === "ok" ? { home: home.data.home ?? null, loops: home.data.loops ?? [] } : null} /></main></>;
}

import { notFound } from "next/navigation";
import { TvManager } from "@/components/facilitator/tv-manager";
import { brandFor, skinOf } from "@/lib/brand";
import { uuid } from "@/lib/room/identity";
import { requireFacilitator } from "@/lib/server/facilitator";
import type { TvManagerData } from "@/lib/tv/types";

export const metadata = { title: "Screens" };

export default async function TvSetup({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid(id)) notFound();
  const { client } = await requireFacilitator();
  const [{ data, error }, home] = await Promise.all([
    client.rpc("tv_manage", { p_engagement: id, p_action: "list", p: {} }),
    client.rpc("home_list", { p_engagement: id }),
  ]);
  if (error) throw new Error("Paired screens unavailable");
  if (data.status !== "ok") notFound();
  const initial = data as TvManagerData;
  const tvAddress = `${brandFor(skinOf(initial.display.skin)).origin}/tv`;
  return <main id="main" className="admin-page cwl-c-screens">
    <TvManager id={id} initial={initial} tvAddress={tvAddress} home={home.data?.status === "ok" ? { home: home.data.home ?? null, loops: home.data.loops ?? [] } : null} />
  </main>;
}

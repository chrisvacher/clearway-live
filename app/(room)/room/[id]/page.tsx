import { notFound } from "next/navigation";
import { RoomAccess } from "@/components/room/room-access";
import { initialRoomAccess, roomInfo } from "@/lib/room/server";

export const dynamic = "force-dynamic";
export default async function EngagementRoom({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ email?: string }> }) {
  const { id } = await params;
  const { email } = await searchParams;
  let info;
  try { info = await roomInfo(id); } catch { /* Fail closed if configuration is unavailable. */ }
  if (!info) notFound();
  const initial=info.closed?{status:"closed"}:await initialRoomAccess(id);
  return <main id="main" className="page-width narrow">
    <div className="eyebrow-live">{info.church}</div><h1>{info.title}</h1>
    {info.closed ? <p>This engagement has closed. Check with your facilitator.</p> : <RoomAccess key={id} engagement={id} email={email?.slice(0,254)} practice={info.type==="practice"} initial={initial} />}
    {info.howTheRoomDecides && <section className="notice"><h2>How the room decides</h2><p>{info.howTheRoomDecides}</p></section>}
  </main>;
}

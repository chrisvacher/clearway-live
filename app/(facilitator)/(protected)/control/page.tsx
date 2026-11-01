import type { Metadata } from "next";
import Link from "next/link";
import { requireFacilitator } from "@/lib/server/facilitator";

export const metadata: Metadata = { title: "Facilitator control" };

export default async function ControlPage() {
  const { client } = await requireFacilitator();
  // RLS lists only engagements this facilitator is assigned to.
  const { data } = await client.from("engagements").select("id,title,status").eq("deleted", false).neq("status", "closed").order("title").limit(200);
  return <main id="main" className="page-width narrow">
    <div className="eyebrow-live">Only you see this</div>
    <h1>Run the room.</h1>
    <p>Choose an engagement to open its live room on this laptop. Open the remote on your phone from there.</p>
    {data?.length ? <ul className="plain-list control-list">{data.map(e => <li key={e.id}><h2>{e.title}</h2><div className="actions"><Link className="button-link" href={`/control/${e.id}`}>Open the live room</Link><Link className="button-link secondary" href={`/remote/${e.id}`}>Open the remote</Link></div></li>)}</ul> : <p>No open engagements yet.</p>}
    <Link className="text-link" href="/setup">Open engagements</Link>
  </main>;
}

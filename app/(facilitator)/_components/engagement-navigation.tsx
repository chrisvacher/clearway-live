import Link from "next/link";
import { requireFacilitator } from "@/lib/server/facilitator";
import "@/components/facilitator/admin.css";

// Explicitly used by admin pages only. Never mounted on the live control, run of show or public surfaces.
export async function EngagementNavigation({ id }: { id: string }) {
  const { client } = await requireFacilitator();
  const { data } = await client.from("engagements").select("title,church:churches!engagements_church_id_fkey(name)").eq("id", id).eq("deleted", false).maybeSingle();
  if (!data) return null;
  const church = data.church as unknown as { name: string } | null;
  const links = [["/setup", "Open engagements"], [`/setup/${id}`, "Edit setup"], [`/setup/${id}/door`, "Open door list"], [`/setup/${id}/tv`, "Manage TVs"], [`/setup/${id}/run-of-show`, "Open run of show"], [`/setup/${id}/discover`, "Open Discover"], [`/setup/${id}/four-lists`, "Open Four Helpful Lists"], [`/control/${id}`, "Open the live room"], [`/control/${id}/after`, "Open After"]];
  return <nav className="engagement-nav" aria-label="Engagement pages"><p><strong>{church?.name ?? "Church not named"}</strong> · {data.title}</p><div className="engagement-nav-links">{links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</div></nav>;
}

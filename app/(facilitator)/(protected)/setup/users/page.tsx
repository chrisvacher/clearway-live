import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { teamHubConfigured } from "@/lib/server/team-hub";
import { UserAdmin } from "@/components/facilitator/user-admin";
import "@/components/facilitator/admin.css";
export const metadata = { title: "Clearway users" };
export default async function UsersPage() {
  const { profile, client } = await requireFacilitator();
  if (!profile.is_admin) notFound();
  const { data, error } = await client.from("clearway_users").select("id,name,email,is_admin").eq("deleted", false).order("name");
  return <main id="main" className="admin-page"><header className="admin-heading"><div><div className="admin-kicker">Clearway admin</div><h1>Clearway users</h1><p>Manage who can prepare and facilitate engagements.</p></div></header>
    <section className="admin-panel"><h2>People with access</h2>{error ? <p role="status">We couldn’t load Clearway users. Please try again.</p> : <ul className="plain-list">{data?.map(person => <li key={person.id}><strong>{person.name}</strong><p>{person.email} · {person.is_admin ? "Admin" : "Facilitator"}</p></li>)}</ul>}</section><UserAdmin configured={teamHubConfigured()} /></main>;
}

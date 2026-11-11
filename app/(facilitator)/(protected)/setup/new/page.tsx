import "@/components/facilitator/admin.css";
import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { teamHubConfigured } from "@/lib/server/team-hub";
import { CreateEngagement, type StartTemplate } from "@/components/facilitator/create-engagement";
import type { Template } from "@/lib/templates/types";

export const metadata = { title: "Create an engagement" };
export default async function NewEngagement() {
  const { profile, client } = await requireFacilitator(); if (!profile.is_admin) notFound();
  const { data, error } = await client.rpc("template_read");
  const templates: StartTemplate[] = !error && data?.status === "ok" ? (data.templates as Template[]).map(t => ({ id: t.id, name: t.name, count: t.count, minutes: t.minutes })) : [];
  return <main id="main" className="admin-page"><header className="admin-heading"><div><div className="admin-kicker">Engagements</div><h1>Create an engagement</h1><p>Four short answers. Everything else can wait until after it exists.</p></div></header>
    <CreateEngagement lead={profile.id} templates={templates} hubConfigured={teamHubConfigured()} /></main>;
}

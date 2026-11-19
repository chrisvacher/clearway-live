import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { teamHubConfigured } from "@/lib/server/team-hub";
import { CreateEngagement, type StartTemplate } from "@/components/facilitator/create-engagement";
import { PageHeader } from "@/components/ui/page-header";
import { brandFor } from "@/lib/brand";
import { readEngagementCreationCapability } from "@/lib/setup/overview-server";
import type { Template } from "@/lib/templates/types";

export const metadata = { title: "Create an engagement" };
export default async function NewEngagement() {
  const { profile, client } = await requireFacilitator(); if (!profile.is_admin) notFound();
  const [{ data, error }, canName] = await Promise.all([client.rpc("template_read"), readEngagementCreationCapability(client)]);
  const templates: StartTemplate[] = !error && data?.status === "ok" ? (data.templates as Template[]).map(t => ({ id: t.id, name: t.name, count: t.count, minutes: t.minutes })) : [];
  return <main id="main" className="admin-page"><PageHeader title="Create an engagement" lead="Four short answers. Everything else can wait until after it exists." />
    <CreateEngagement lead={profile.id} templates={templates} hubConfigured={teamHubConfigured()} admin={profile.is_admin} canName={canName} hosts={{ clearway: brandFor("clearway").host, novetera: brandFor("novetera").host }} /></main>;
}

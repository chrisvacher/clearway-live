import { requireFacilitator } from "@/lib/server/facilitator";
import { uuid } from "@/lib/room/identity";
import { TemplateLibrary } from "@/components/templates/template-library";
import type { TemplateLibrary as Library } from "@/lib/templates/types";

export const metadata = { title: "Templates" };
export const dynamic = "force-dynamic";
export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ engagement?: string; template?: string }> }) {
  const { client, profile } = await requireFacilitator();
  const { engagement, template } = await searchParams;
  const { data, error } = await client.rpc("template_read");
  const library: Library | null = !error && data?.status === "ok" ? { templates: data.templates, engagements: data.engagements } : null;
  return <TemplateLibrary initial={library} admin={profile.is_admin} engagement={uuid(engagement) ? engagement : null} template={uuid(template) ? template : null} />;
}

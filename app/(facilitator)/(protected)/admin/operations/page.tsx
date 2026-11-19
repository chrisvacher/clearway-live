import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { PageHeader } from "@/components/ui/page-header";
import { OperationsPanel } from "@/components/facilitator/operations-panel";
export const metadata = { title: "Operations" };
export default async function OperationsPage() {
  const { profile } = await requireFacilitator();
  if (!profile.is_admin) notFound();
  return <main id="main" className="admin-page admin-operations">
    <PageHeader kicker="Clearway admin" title="Operations" lead="File protection and problems the app has reported." />
    <OperationsPanel />
  </main>;
}

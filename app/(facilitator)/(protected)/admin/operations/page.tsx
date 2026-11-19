import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { OperationsPanel } from "@/components/facilitator/operations-panel";
export const metadata = { title: "Operations" };
export default async function OperationsPage() {
  const { profile } = await requireFacilitator();
  if (!profile.is_admin) notFound();
  return <main id="main" className="admin-page admin-operations"><header className="admin-heading"><div><div className="admin-kicker">Clearway admin</div><h1>Operations</h1><p>Check file protection and problems reported by the app.</p></div></header><OperationsPanel /></main>;
}

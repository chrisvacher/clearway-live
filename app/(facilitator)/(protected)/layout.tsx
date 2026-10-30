import type { ReactNode } from "react";
import { requireFacilitator } from "@/lib/server/facilitator";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  await requireFacilitator();
  return children;
}

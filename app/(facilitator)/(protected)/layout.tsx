import type { ReactNode } from "react";
import { requireFacilitator } from "@/lib/server/facilitator";
import { AppShell } from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const { profile } = await requireFacilitator();
  return <AppShell admin={profile.is_admin}>{children}</AppShell>;
}

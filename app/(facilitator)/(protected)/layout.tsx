import type { ReactNode } from "react";
import "@/components/facilitator/admin.css";
import "@/components/facilitator/fields.css";
import "@/components/ui/ui.css";
import { ToastProvider } from "@/components/ui/toast";
import { requireFacilitator } from "@/lib/server/facilitator";
import { AppShell } from "@/components/layout/app-shell";
import { FacilitatorProvider } from "@/components/layout/facilitator-context";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const { profile } = await requireFacilitator();
  return <FacilitatorProvider facilitator={{ name: profile.name, email: profile.email }}><ToastProvider><AppShell admin={profile.is_admin}>{children}</AppShell></ToastProvider></FacilitatorProvider>;
}

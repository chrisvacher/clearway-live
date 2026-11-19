import type { ReactNode } from "react";
import "@/components/facilitator/admin.css";
import "@/components/facilitator/fields.css";
import "@/components/ui/ui.css";
import { ToastProvider } from "@/components/ui/toast";
import { requireFacilitator } from "@/lib/server/facilitator";
import { readShellData } from "@/lib/server/shell";
import { AppShell, ShellNavigationProvider } from "@/components/layout/app-shell";
import { FacilitatorProvider } from "@/components/layout/facilitator-context";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const { client, profile } = await requireFacilitator();
  const navigation = await readShellData(client, profile);
  return <FacilitatorProvider facilitator={{ name: profile.name, email: profile.email }}>
    <ToastProvider>
      <ShellNavigationProvider data={navigation}>
        <AppShell admin={profile.is_admin}>{children}</AppShell>
      </ShellNavigationProvider>
    </ToastProvider>
  </FacilitatorProvider>;
}

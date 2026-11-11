import type { ReactNode } from "react";
import { requireFacilitator } from "@/lib/server/facilitator";
import { readShellEngagement } from "@/lib/server/shell";
import { uuid } from "@/lib/room/identity";
import { AppShell } from "@/components/layout/app-shell";

// Every page of one engagement sits in the app shell with that engagement's sidebar.
export default async function EngagementLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid(id)) return children;
  const { client } = await requireFacilitator();
  const engagement = await readShellEngagement(client, id);
  return engagement ? <AppShell engagement={engagement}>{children}</AppShell> : children;
}

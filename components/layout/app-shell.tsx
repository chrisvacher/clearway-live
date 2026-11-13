"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { EyeOff } from "lucide-react";
import { ShellNav, type ShellEngagement } from "@/components/layout/shell-nav";

const engagementPath = /^\/(setup|control)\/[0-9a-f]{8}-[0-9a-f-]{27}(\/|$)/i;
// Pages that fill the window with their own layout. They carry the same sidebar themselves, or none (the live room, the print view).
const ownLayout = (path: string) => /^\/control\/[^/]+$/.test(path) || /^\/setup\/[^/]+\/run-of-show(\/|$)/.test(path) || path === "/setup/templates";

// The app shell for signed-in pages: the sidebar, the "Only you see this" band, then the page.
// The outer layout draws it for Clearway's own pages and stands aside on an engagement's pages, where the engagement layout draws it.
export function AppShell({ engagement, admin = false, children }: { engagement?: ShellEngagement | null; admin?: boolean; children: ReactNode }) {
  const pathname = usePathname();
  if (ownLayout(pathname) || (!engagement && engagementPath.test(pathname))) return <>{children}</>;
  return <div className="app-shell">
    <ShellNav engagement={engagement} admin={admin} fourLists={engagement?.fourLists ?? true} />
    <div className="shell-main">
      <div className="show-private"><EyeOff size={15} aria-hidden="true" />Only you see this</div>
      {children}
    </div>
  </div>;
}

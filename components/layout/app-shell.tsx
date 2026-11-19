"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppWindow, Copy, EyeOff, Plus } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { JumpTo, type JumpItem } from "@/components/ui/jump-to";
import { blockedPopupLine, openTvWindow } from "@/lib/tv/pair-link";
import { localRead, localWrite, ShellNavigationContext, type SidebarChoice } from "./facilitator-context";
import { clearwayGroups, engagementGroups, ShellNav, type ShellData, type ShellEngagement } from "@/components/layout/shell-nav";

const engagementPath = /^\/(admin|control)\/[0-9a-f]{8}-[0-9a-f-]{27}(\/|$)/i;
// Workspaces with their own full-window layout mount ShellNav directly when appropriate.
const ownLayout = (path: string) => /^\/control\/[^/]+$/.test(path) || /^\/admin\/[^/]+\/run-of-show(\/|$)/.test(path) || path === "/admin/templates";
const recentKey = "clearway-live.navigation-recent.v1";
const sidebarKey = "clearway-live.navigation-sidebar.v1";

export function ShellNavigationProvider({ data, children }: { data: ShellData; children: ReactNode }) {
  const pathname = usePathname();
  const toast = useToast();
  const [jumpOpen, setJumpOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [preference, setPreference] = useState<SidebarChoice>(null);
  const newLink = useRef<HTMLAnchorElement>(null);
  const storageKey = `${recentKey}:${data.profileId}`;

  // Preferences are applied after hydration. The same markup renders on the server and the first client pass.
  useEffect(() => {
    const value = localRead(sidebarKey);
    if (value === "expanded" || value === "collapsed") setPreference(value);
  }, []);

  useEffect(() => {
    let saved: string[] = [];
    try {
      const stored: unknown = JSON.parse(localRead(storageKey) ?? "[]");
      if (Array.isArray(stored)) saved = stored.filter((value): value is string => typeof value === "string");
    } catch { /* A stale preference is harmless. */ }
    const updated = [pathname, ...saved.filter(path => path !== pathname)].slice(0, 5);
    localWrite(storageKey, JSON.stringify(updated));
    setRecent(updated);
  }, [pathname, storageKey]);

  useEffect(() => {
    if (!data.admin) return;
    function newEngagement(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "n" || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.closest("input, textarea, select, [contenteditable]:not([contenteditable=false])") || document.querySelector("dialog[open]"))) return;
      event.preventDefault();
      newLink.current?.click();
    }
    window.addEventListener("keydown", newEngagement);
    return () => window.removeEventListener("keydown", newEngagement);
  }, [data.admin]);

  function toggleSidebar(collapsed: boolean) {
    const next = collapsed ? "expanded" : "collapsed";
    setPreference(next);
    localWrite(sidebarKey, next);
  }

  async function copyRoomLink(href: string) {
    try {
      await navigator.clipboard.writeText(href);
      toast(`Link copied: ${href.replace(/^https?:\/\//, "")}`);
    } catch { toast("Couldn't copy the room link. Try again."); }
  }

  async function openTV(id: string) {
    const result = await openTvWindow(window, async () => {
      const response = await fetch(`/api/tv/control/${id}/window`, { method: "POST", cache: "no-store" });
      const body = await response.json() as { status: string; url?: string };
      return response.ok && body.status === "ok" ? body.url ?? null : null;
    });
    if (result.how === "failed") toast("Couldn't open the TV. Try again.");
    if (result.how === "tab") toast(blockedPopupLine);
    if (result.how === "link" && result.url) {
      const url = result.url;
      toast("Your browser blocked the pop-up window.", { action: { label: "Open the TV", onClick: () => { window.open(url, "_blank", "noopener,noreferrer"); } } });
    }
  }

  const items: JumpItem[] = [];
  if (jumpOpen) {
    if (!data.eventOnly) {
      for (const item of clearwayGroups(data.admin).flatMap(group => group.items)) {
        items.push({ ...item, id: item.href, group: "Pages" });
      }
    }
    const workspacePaths = new Set(items.map(item => item.id));
    if (data.admin) items.push({ id: "new-engagement", group: "Actions", label: "New engagement", href: "/admin/new", icon: <Plus aria-hidden="true" size={16} />, detail: <kbd>N</kbd> });
    for (const entry of data.entries) {
      const keywords = `${entry.title} ${entry.church} ${entry.linkName}`;
      for (const item of engagementGroups(entry, false).flatMap(group => group.items)) {
        if (workspacePaths.has(item.href)) continue;
        items.push({ ...item, id: item.href, label: `${item.label} · ${entry.title}`, detail: entry.church, keywords, group: "Pages" });
      }
      items.push({ id: `copy-${entry.id}`, label: `Copy room link · ${entry.title}`, detail: entry.church, keywords, group: "Actions", icon: <Copy aria-hidden="true" size={16} />, onSelect: () => void copyRoomLink(entry.roomLink) });
      if (entry.canOpenTv) items.push({ id: `tv-${entry.id}`, label: `Open the TV · ${entry.title}`, detail: entry.church, keywords, group: "Actions", icon: <AppWindow aria-hidden="true" size={16} />, onSelect: () => void openTV(entry.id) });
    }
  }
  return <ShellNavigationContext.Provider value={{ data, openJump: () => setJumpOpen(true), preference, toggleSidebar }}>
    {children}
    {data.admin && <Link href="/admin/new" ref={newLink} hidden prefetch={false} />}
    <JumpTo open={jumpOpen} onOpen={() => setJumpOpen(true)} onClose={() => setJumpOpen(false)} items={items} recentIds={recent} />
  </ShellNavigationContext.Provider>;
}

// The outer layout draws the workspace shell; engagement layouts draw their own instance.
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

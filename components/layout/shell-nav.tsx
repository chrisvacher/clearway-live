"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  Activity, ArrowLeft, CalendarDays, ChartColumn, ChevronsUpDown, ClipboardCheck, Columns4, FileText,
  FlaskConical, House, Layers, LayoutGrid, Link2, List, ListChecks, LogOut, Menu as MenuIcon, Monitor,
  PanelLeft, Radio, Search, SlidersHorizontal, UserCheck, Users, X,
} from "lucide-react";
import { LiveWordmark } from "@/components/brand/live-wordmark";
import { localRead, localWrite, useFacilitator, useShellNavigation, type ShellFacilitator } from "./facilitator-context";
import { Button } from "@/components/ui/button";
import { StageChip, StatusChip } from "@/components/ui/chips";
import { Dialog } from "@/components/ui/dialog";
import { Menu } from "@/components/ui/menu";
import { practiceId } from "@/lib/room/practice";
import type { Stage } from "@/lib/setup/stage";

export type ShellEngagement = {
  id: string; title: string; church: string; type: string;
  fourLists?: boolean; brand?: string; stage?: Stage;
};

export type ShellEntry = ShellEngagement & {
  upcoming: boolean; date: string | null; linkName: string; roomLink: string; canOpenTv: boolean;
};

export type ShellData = {
  entries: ShellEntry[];
  operationsGroups: string[];
  profileId: string;
  admin: boolean;
  eventOnly: boolean;
};

type Item = { href: string; label: string; icon: ReactNode; under?: boolean };
type Group = { name: string; items: Item[] };

// A workshop only has its own preparation, live room and results.
export function engagementGroups(e: ShellEngagement, fourLists = true): Group[] {
  const setup = `/admin/${e.id}`, control = `/control/${e.id}`, wayfinding = e.type !== "team_workshop";
  return [
    { name: "Prepare", items: [
      { href: setup, label: "Overview", icon: <House aria-hidden="true" size={18} /> },
      { href: `${setup}/details`, label: "Details", icon: <SlidersHorizontal aria-hidden="true" size={18} /> },
      { href: `${setup}/joining`, label: "People", icon: <Users aria-hidden="true" size={18} /> },
      { href: `${setup}/run-of-show`, label: "Run of show", icon: <List aria-hidden="true" size={18} />, under: true },
      { href: `${setup}/tv`, label: "Screens", icon: <Monitor aria-hidden="true" size={18} /> },
      ...(wayfinding ? [{ href: `${setup}/discover`, label: "Discover", icon: <Search aria-hidden="true" size={18} /> }] : []),
    ] },
    { name: "Run", items: [
      { href: control, label: "Live room", icon: <Radio aria-hidden="true" size={18} /> },
      ...(wayfinding && fourLists ? [{ href: `${setup}/four-lists`, label: "Four Helpful Lists", icon: <Columns4 aria-hidden="true" size={18} /> }] : []),
      ...(wayfinding ? [{ href: `${control}/review`, label: "Overnight review", icon: <ListChecks aria-hidden="true" size={18} /> }] : []),
    ] },
    { name: "After", items: [
      ...(wayfinding ? [{ href: `${control}/after`, label: "After the retreat", icon: <CalendarDays aria-hidden="true" size={18} /> }] : []),
      { href: `${control}/recap`, label: "Results", icon: <ChartColumn aria-hidden="true" size={18} /> },
      ...(wayfinding ? [
        { href: `${control}/report`, label: "Report", icon: <FileText aria-hidden="true" size={18} /> },
        { href: `${control}/plan`, label: "Visibility plan", icon: <UserCheck aria-hidden="true" size={18} /> },
        { href: `${control}/share`, label: "Read-only copy", icon: <Link2 aria-hidden="true" size={18} /> },
        { href: `${control}/check-ins`, label: "Check-ins", icon: <ClipboardCheck aria-hidden="true" size={18} /> },
      ] : []),
    ] },
  ];
}

export function clearwayGroups(admin: boolean): Group[] {
  return [
    { name: "Workspace", items: [
      { href: "/admin", label: "Engagements", icon: <LayoutGrid aria-hidden="true" size={18} /> },
      { href: "/admin/templates", label: "Templates and blocks", icon: <Layers aria-hidden="true" size={18} /> },
      { href: `/admin/${practiceId}`, label: "Practice room", icon: <FlaskConical aria-hidden="true" size={18} /> },
    ] },
    ...(admin ? [{ name: "Admin", items: [
      { href: "/admin/users", label: "Clearway users", icon: <Users aria-hidden="true" size={18} /> },
      { href: "/admin/operations", label: "Operations", icon: <Activity aria-hidden="true" size={18} /> },
    ] }] : []),
  ];
}

export function initials(who: ShellFacilitator) {
  const words = (who.name.trim() || who.email.split("@")[0]).split(/[\s._-]+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

function ShellProfile({ who }: { who: ShellFacilitator }) {
  const signOut = useRef<HTMLFormElement>(null);
  const label = `Account menu for ${who.name || who.email}`;
  return <div className="shell-profile" title={label}>
    <Menu className="shell-profile-menu" label={label}
      trigger={<>
        <span className="shell-avatar" aria-hidden="true">{initials(who)}</span>
        <span className="shell-profile-who"><strong>{who.name || who.email}</strong>{who.name && <span>{who.email}</span>}</span>
        <ChevronsUpDown className="shell-profile-arrows" size={16} aria-hidden="true" />
      </>}
      items={[{ label: "Sign out", icon: <LogOut aria-hidden="true" />, onSelect: () => signOut.current?.requestSubmit() }]}
    />
    <form ref={signOut} action="/auth/sign-out" method="post" hidden />
  </div>;
}

function EngagementSwitcher({ engagement, upcoming, rail }: { engagement: ShellEngagement; upcoming: ShellEntry[]; rail: boolean }) {
  const key = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  function position() {
    const anchor = trigger.current?.getBoundingClientRect(), popup = panel.current;
    if (!anchor || !popup) return;
    const left = rail ? anchor.right + 8 : anchor.left;
    const top = rail ? anchor.top : anchor.bottom + 6;
    popup.style.left = `${Math.max(8, Math.min(left, window.innerWidth - popup.offsetWidth - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(top, window.innerHeight - popup.offsetHeight - 8))}px`;
  }

  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    return () => {
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
    };
  });

  function toggle() {
    const popup = panel.current;
    if (!popup) return;
    if (popup.matches(":popover-open")) popup.hidePopover();
    else {
      setQuery("");
      popup.showPopover();
      position();
      search.current?.focus({ preventScroll: true });
    }
  }

  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const shown = upcoming.filter(entry => {
    const key = `${entry.title} ${entry.church} ${entry.linkName}`.toLocaleLowerCase();
    return terms.every(term => key.includes(term));
  });

  return <div className="shell-switcher">
    <button type="button" ref={trigger} className="shell-who" onClick={toggle}
      aria-label={`Switch engagement, ${engagement.title}`} title="Switch engagement" aria-expanded={open} aria-controls={key}>
      <span className="shell-who-meta">
        <strong>{engagement.title}</strong><span>{engagement.church}</span>
        <span className="shell-who-chips"><StageChip stage={engagement.stage ?? "setup"} compact /><span className="shell-brand-chip">{engagement.brand ?? "Clearway"}</span></span>
      </span>
      <ChevronsUpDown size={16} aria-hidden="true" />
    </button>
    <div id={key} ref={panel} className="shell-switcher-popover" popover="auto" aria-label="Upcoming engagements"
      onToggle={event => setOpen(event.currentTarget.matches(":popover-open"))}
      onKeyDown={event => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        panel.current?.hidePopover();
        trigger.current?.focus();
      }}>
      <div className="shell-switcher-search"><Search size={16} aria-hidden="true" />
        <input type="search" ref={search} aria-label="Search upcoming engagements" placeholder="Search engagements" value={query} onChange={event => setQuery(event.target.value)} />
      </div>
      <ul className="shell-switcher-list">
        {shown.map(entry => <li key={entry.id}><Link href={`/admin/${entry.id}`} onClick={() => panel.current?.hidePopover()}>
          <strong>{entry.title}</strong><span>{entry.church}</span><span>{entry.date}</span>
        </Link></li>)}
      </ul>
      {!shown.length && <p className="shell-switcher-empty">{query ? "No matching engagements" : "No upcoming engagements"}</p>}
      <Link className="shell-switcher-all" href="/admin" onClick={() => panel.current?.hidePopover()}><ArrowLeft size={16} aria-hidden="true" />All engagements</Link>
    </div>
  </div>;
}

export function ShellNav({ engagement, admin = false, fourLists = true }: { engagement?: ShellEngagement | null; admin?: boolean; fourLists?: boolean }) {
  const pathname = usePathname();
  const who = useFacilitator();
  const navigation = useShellNavigation();
  const data = navigation?.data;
  const [collapsedLocal, setCollapsedLocal] = useState(false);
  const [viewport, setViewport] = useState({ mobile: false, narrow: false });
  const [openAt, setOpenAt] = useState<string | null>(null);
  const [operationsSeen, setOperationsSeen] = useState("");
  const menuId = useId();
  const toggleSidebar = navigation?.toggleSidebar;
  const preference = navigation?.preference;
  const isAdmin = data?.admin ?? admin;
  const upcoming = data?.entries.filter(entry => entry.upcoming) ?? [];
  const open = viewport.mobile && openAt === pathname;
  const defaultRail = viewport.narrow && /\/run-of-show\/?$/.test(pathname);
  const rail = !viewport.mobile && (preference === "collapsed" || (preference == null && (collapsedLocal || defaultRail)));
  const recentIssue = data?.operationsGroups.reduce((last, date) => date > last ? date : last, "") ?? "";
  const profileId = data?.profileId;
  const unreadCount = data?.operationsGroups.filter(date => date > operationsSeen).length ?? 0;

  useEffect(() => {
    const mobile = window.matchMedia("(width < 900px)");
    const narrow = window.matchMedia("(width < 1600px)");
    const refresh = () => setViewport({ mobile: mobile.matches, narrow: narrow.matches });
    refresh();
    mobile.addEventListener("change", refresh);
    narrow.addEventListener("change", refresh);
    return () => {
      mobile.removeEventListener("change", refresh);
      narrow.removeEventListener("change", refresh);
    };
  }, []);

  useEffect(() => {
    if (!profileId || !isAdmin) return;
    const storageKey = `clearway-live.operations-seen.v1:${profileId}`;
    const seen = localRead(storageKey) ?? "";
    if (pathname === "/admin/operations" && recentIssue > seen) {
      localWrite(storageKey, recentIssue);
      setOperationsSeen(recentIssue);
    } else setOperationsSeen(seen);
  }, [isAdmin, pathname, profileId, recentIssue]);

  useEffect(() => {
    if (viewport.mobile) return;
    function shortcut(event: KeyboardEvent) {
      if (event.key !== "\\" || (!event.metaKey && !event.ctrlKey) || event.altKey || event.shiftKey) return;
      event.preventDefault();
      if (toggleSidebar) toggleSidebar(rail);
      else setCollapsedLocal(!rail);
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [rail, toggleSidebar, viewport.mobile]);

  const groups = engagement ? engagementGroups(engagement, fourLists) : clearwayGroups(isAdmin);
  const current = (item: Item) => pathname === item.href
    || (item.under === true && pathname.startsWith(`${item.href}/`))
    || (item.href === "/admin" && pathname === "/admin/new");
  const collapseLabel = rail ? "Expand the sidebar" : "Collapse the sidebar";
  const links = <div className="shell-links">
    {engagement && <EngagementSwitcher engagement={engagement} upcoming={upcoming} rail={rail} />}
    {navigation && <button type="button" className="shell-jump-button" onClick={navigation.openJump} aria-label="Jump to"
      title="Jump to" aria-keyshortcuts="Meta+K Control+K"><Search size={16} aria-hidden="true" /><span>Jump to</span><kbd aria-hidden="true">⌘K</kbd></button>}
    {groups.map(group => <div className="shell-group" key={group.name} role="group" aria-label={group.name}>
      <p className="shell-group-name" aria-hidden="true">{group.name}</p>
      {group.items.map(item => <Link key={item.href} className="shell-nav-item" href={item.href} aria-label={item.label} title={item.label}
        aria-current={current(item) ? "page" : undefined}
        aria-description={item.href === "/admin" ? `${upcoming.length} upcoming` : item.href === "/admin/operations" && unreadCount ? `${unreadCount} unread problem groups` : undefined}>
        {item.icon}<span className="shell-item-label">{item.label}</span>
        {item.href === "/admin" && <span className="shell-count" aria-hidden="true">{upcoming.length}</span>}
        {item.href === "/admin/operations" && unreadCount > 0 && <span className="shell-count" aria-hidden="true"><StatusChip compact tone="warning">{unreadCount}</StatusChip></span>}
      </Link>)}
    </div>)}
    {engagement && !data?.eventOnly && <Link className="shell-back shell-nav-item" href="/admin" title="All engagements" aria-label="All engagements">
      <ArrowLeft size={18} aria-hidden="true" /><span className="shell-item-label">All engagements</span>
    </Link>}
    {who && <ShellProfile who={who} />}
  </div>;

  return <nav className="show-sidebar shell-nav" aria-label={engagement ? "Engagement" : "Clearway Live"} data-collapsed={rail} data-open={open}>
    <div className="shell-top">
      <Link className="shell-mark" href={data?.eventOnly && engagement ? `/admin/${engagement.id}` : "/admin"}
        aria-label="Clearway Live" title="Clearway Live"><LiveWordmark size="app" label={null} /></Link>
      <button className="shell-collapse" type="button" aria-label={collapseLabel} title={collapseLabel} aria-keyshortcuts="Meta+\\ Control+\\"
        onClick={() => toggleSidebar ? toggleSidebar(rail) : setCollapsedLocal(!rail)}><PanelLeft size={18} aria-hidden="true" /></button>
      <button className="show-button shell-toggle" type="button" aria-expanded={open} aria-controls={open ? menuId : undefined}
        onClick={() => setOpenAt(open ? null : pathname)}><MenuIcon size={18} aria-hidden="true" />Menu</button>
    </div>
    {!viewport.mobile && <div className="shell-desktop-links">{links}</div>}
    {open && <Dialog open label="Navigation" className="shell-drawer" onClose={() => setOpenAt(null)}>
      <div id={menuId} className="shell-drawer-content">
        <header className="shell-drawer-head"><LiveWordmark size="app" /><Button data-initial-focus variant="quiet" iconOnly aria-label="Close navigation" onClick={() => setOpenAt(null)}><X aria-hidden="true" /></Button></header>
        {links}
      </div>
    </Dialog>}
  </nav>;
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Activity, BarChart3, CalendarDays, ClipboardCheck, Columns4, DoorOpen, FileText, FlaskConical, Home, LayoutDashboard, LayoutTemplate, Link2, ListChecks, ListOrdered, Menu, Monitor, Radio, Search, SlidersHorizontal, UserCheck, Users } from "lucide-react";
import { LiveWordmark } from "@/components/brand/live-wordmark";
import { practiceId } from "@/lib/room/practice";

export type ShellEngagement = { id: string; title: string; church: string; type: string; fourLists?: boolean };
type Item = { href: string; label: string; icon: ReactNode; under?: boolean };
type Group = { name: string | null; items: Item[] };

// A workshop gets only the pages a workshop uses. Wayfinding types add Discover, the overnight review and the After pages.
export function engagementGroups(e: ShellEngagement, fourLists = true): Group[] {
  const setup = `/setup/${e.id}`, control = `/control/${e.id}`, wayfinding = e.type !== "team_workshop";
  const s = 18;
  return [
    { name: "Prepare", items: [
      { href: setup, label: "Overview", icon: <Home aria-hidden="true" size={s} /> },
      { href: `${setup}/details`, label: "Details", icon: <SlidersHorizontal aria-hidden="true" size={s} /> },
      { href: `${setup}/joining`, label: "People and joining", icon: <Users aria-hidden="true" size={s} /> },
      { href: `${setup}/run-of-show`, label: "Run of show", icon: <ListOrdered aria-hidden="true" size={s} />, under: true },
      ...(wayfinding ? [{ href: `${setup}/discover`, label: "Discover", icon: <Search aria-hidden="true" size={s} /> }] : []),
      ...(wayfinding && fourLists ? [{ href: `${setup}/four-lists`, label: "Four Helpful Lists", icon: <Columns4 aria-hidden="true" size={s} /> }] : []),
      { href: `${setup}/tv`, label: "Screens", icon: <Monitor aria-hidden="true" size={s} /> },
    ] },
    { name: "Run", items: [
      { href: control, label: "Live room", icon: <Radio aria-hidden="true" size={s} /> },
      { href: `${setup}/door`, label: "Door list", icon: <DoorOpen aria-hidden="true" size={s} /> },
      ...(wayfinding ? [{ href: `${control}/review`, label: "Overnight review", icon: <ListChecks aria-hidden="true" size={s} /> }] : []),
    ] },
    { name: "After", items: [
      ...(wayfinding ? [{ href: `${control}/after`, label: "After the retreat", icon: <CalendarDays aria-hidden="true" size={s} /> }] : []),
      { href: `${control}/recap`, label: "Results", icon: <BarChart3 aria-hidden="true" size={s} /> },
      ...(wayfinding ? [
        { href: `${control}/report`, label: "Report", icon: <FileText aria-hidden="true" size={s} /> },
        { href: `${control}/plan`, label: "Visibility plan", icon: <UserCheck aria-hidden="true" size={s} /> },
        { href: `${control}/share`, label: "Read-only copy", icon: <Link2 aria-hidden="true" size={s} /> },
        { href: `${control}/check-ins`, label: "Check-ins", icon: <ClipboardCheck aria-hidden="true" size={s} /> },
      ] : []),
    ] },
  ];
}

export function clearwayGroups(admin: boolean): Group[] {
  const s = 18;
  return [
    { name: null, items: [
      { href: "/setup", label: "Engagements", icon: <LayoutDashboard aria-hidden="true" size={s} /> },
      { href: "/setup/templates", label: "Templates", icon: <LayoutTemplate aria-hidden="true" size={s} /> },
      { href: `/setup/${practiceId}`, label: "Practice room", icon: <FlaskConical aria-hidden="true" size={s} /> },
    ] },
    ...(admin ? [{ name: "Admin", items: [
      { href: "/setup/users", label: "Clearway users", icon: <Users aria-hidden="true" size={s} /> },
      { href: "/setup/operations", label: "Operations", icon: <Activity aria-hidden="true" size={s} /> },
    ] }] : []),
  ];
}

// The one sidebar for every signed-in page: the Clearway Live lockup, then either Clearway's own pages or one engagement's.
export function ShellNav({ engagement, admin = false, fourLists = true }: { engagement?: ShellEngagement | null; admin?: boolean; fourLists?: boolean }) {
  const pathname = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const groups = engagement ? engagementGroups(engagement, fourLists) : clearwayGroups(admin);
  const current = (item: Item) => pathname === item.href || (item.under === true && pathname.startsWith(`${item.href}/`)) || (item.href === "/setup" && pathname === "/setup/new");
  return <nav className="show-sidebar shell-nav" aria-label={engagement ? "Engagement" : "Clearway Live"} data-open={open}>
    <div className="shell-top">
      <Link className="shell-mark" href="/setup" aria-label="Clearway Live, all engagements"><LiveWordmark label={null} /></Link>
      <button className="show-button shell-toggle" type="button" aria-expanded={open} aria-controls="shell-links" onClick={() => setOpenAt(open ? null : pathname)}><Menu aria-hidden="true" size={18} />Menu</button>
    </div>
    <div className="shell-links" id="shell-links">
      {engagement && <p className="shell-who"><strong>{engagement.title}</strong><span>{engagement.church}</span></p>}
      {groups.map(group => <div className="shell-group" key={group.name ?? "main"} role="group" aria-label={group.name ?? undefined}>
        {group.name && <p className="shell-group-name" aria-hidden="true">{group.name}</p>}
        {group.items.map(item => <Link key={item.href} href={item.href} aria-current={current(item) ? "page" : undefined}>{item.icon}{item.label}</Link>)}
      </div>)}
      {engagement && <Link className="shell-back" href="/setup"><LayoutDashboard aria-hidden="true" size={18} />All engagements</Link>}
    </div>
  </nav>;
}

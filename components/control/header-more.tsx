"use client";

import { AppWindow, PowerOff, Printer } from "lucide-react";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { TvNoteLine, useOpenTv } from "./open-tv-window";

export function HeaderMore({ engagement, onEnd, closed }: { engagement: string; onEnd?: () => void; closed: boolean }) {
  const tv = useOpenTv(engagement);
  const items: MenuItem[] = [];
  if (!closed) items.push({ label: "Open the TV in a new window", icon: <AppWindow size={16} aria-hidden="true" />, disabled: tv.busy, onSelect: () => void tv.open() });
  items.push({ label: "Print run of show", icon: <Printer size={16} aria-hidden="true" />, onSelect: () => { window.open(`/admin/${engagement}/run-of-show/print`, "_blank", "noopener,noreferrer"); } });
  if (onEnd && !closed) items.push({ label: "End the workshop", icon: <PowerOff size={16} aria-hidden="true" />, danger: true, dividerBefore: true, onSelect: onEnd });
  return <div className="ctl-header-more" data-testid="header-more"><Menu label="More actions" items={items} /><TvNoteLine note={tv.note} /></div>;
}

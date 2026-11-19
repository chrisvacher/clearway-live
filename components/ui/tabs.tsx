"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

type TabItem = { id: string; label: string; count?: number; icon?: ReactNode };

export function Tabs({ label, items, value, onChange }: {
  label: string;
  items: readonly TabItem[];
  value: string;
  onChange: (id: string) => void;
}) {
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  function keyboard(event: KeyboardEvent, index: number) {
    const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!direction && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + direction + items.length) % items.length;
    onChange(items[next].id);
    buttons.current[items[next].id]?.focus();
  }

  return <div className="cwl-ui-tabs" role="tablist" aria-label={label}>
    {items.map((item, index) => <button type="button" role="tab" key={item.id} ref={element => { buttons.current[item.id] = element; }}
      id={`cwl-tab-${item.id}`} aria-controls={`cwl-panel-${item.id}`} aria-selected={item.id === value} tabIndex={item.id === value ? 0 : -1}
      onClick={() => onChange(item.id)} onKeyDown={event => keyboard(event, index)}>
      {item.icon}{item.label}{item.count !== undefined && <span className="cwl-ui-tab-count">{item.count}</span>}
    </button>)}
  </div>;
}

export function TabPanel({ id, active, children }: { id: string; active: boolean; children: ReactNode }) {
  return <div role="tabpanel" id={`cwl-panel-${id}`} aria-labelledby={`cwl-tab-${id}`} hidden={!active} tabIndex={0} className="cwl-ui-tab-panel">{children}</div>;
}

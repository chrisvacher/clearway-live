"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { Dialog } from "./dialog";

export type JumpItem = {
  id: string;
  label: string;
  detail?: ReactNode;
  group: "Pages" | "Actions";
  icon?: ReactNode;
  href?: string;
  keywords?: string;
  onSelect?: () => void;
};

type JumpGroup = { label: "Recent" | JumpItem["group"]; items: readonly JumpItem[] };

function words(text: string) {
  return text.toLocaleLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function JumpTo({ open, onOpen, onClose, items, recentIds = [] }: {
  open: boolean;
  onOpen?: () => void;
  onClose: () => void;
  items: readonly JumpItem[];
  recentIds?: readonly string[];
}) {
  useEffect(() => {
    if (!onOpen) return;
    function handleShortcut(event: globalThis.KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || (!event.ctrlKey && !event.metaKey) || event.altKey) return;
      event.preventDefault();
      onOpen?.();
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [onOpen]);

  return open ? <JumpDialog onClose={onClose} items={items} recentIds={recentIds} /> : null;
}

function JumpDialog({ onClose, items, recentIds }: { onClose: () => void; items: readonly JumpItem[]; recentIds: readonly string[] }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const terms = words(query);
  const matched = items.filter(item => {
    const candidates = words(`${item.label} ${item.keywords ?? ""} ${typeof item.detail === "string" ? item.detail : ""}`);
    return terms.every(term => candidates.some(candidate => candidate.startsWith(term)));
  });
  const actions = matched.filter(item => item.group === "Actions");
  const groups: JumpGroup[] = terms.length
    ? [{ label: "Pages", items: matched.filter(item => item.group === "Pages") }, { label: "Actions", items: actions }]
    : [{ label: "Recent", items: recentIds.slice(0, 5).flatMap(id => items.find(item => item.group === "Pages" && item.id === id) ?? []) }, { label: "Actions", items: actions }];
  const results = groups.flatMap(group => group.items);
  const active = Math.min(index, results.length - 1);
  const activeId = active >= 0 ? `${id}-result-${results[active].id}` : undefined;

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  function keyboard(event: KeyboardEvent<HTMLInputElement>) {
    const direction = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (direction && results.length) {
      event.preventDefault();
      setIndex((active + results.length + direction) % results.length);
    }
    if (event.key === "Enter" && activeId) {
      event.preventDefault();
      document.getElementById(activeId)?.click();
    }
  }

  return <Dialog open onClose={onClose} label="Jump to" className="cwl-ui-jump">
    <div className="cwl-ui-jump-search">
      <Search size={16} aria-hidden="true" />
      <input role="combobox" aria-label="Jump to an event, page or action" aria-expanded="true" aria-autocomplete="list"
        aria-controls={id} aria-activedescendant={activeId} data-initial-focus
        value={query} onChange={event => { setQuery(event.target.value); setIndex(0); }} onKeyDown={keyboard}
        placeholder="Jump to an event, page or action" />
      <kbd>esc</kbd>
    </div>
    <div id={id} role="listbox" aria-label="Search results" className="cwl-ui-jump-results">
      {groups.filter(group => group.items.length).map(group => <div role="group" aria-label={group.label} key={group.label}>
        <div className="cwl-ui-option-group" aria-hidden="true">{group.label}</div>
        {group.items.map(item => {
          const itemId = `${id}-result-${item.id}`;
          const props = {
            id: itemId,
            role: "option",
            "aria-selected": itemId === activeId,
            tabIndex: -1,
            className: "cwl-ui-option",
            onMouseEnter: () => setIndex(results.indexOf(item)),
            onMouseDown: (event: React.MouseEvent) => event.preventDefault(),
            onClick: () => { item.onSelect?.(); onClose(); },
          };
          const content = <><span>{item.icon}{item.label}</span>{item.detail && <small>{item.detail}</small>}</>;
          return item.href
            ? <Link key={item.id} href={item.href} {...props}>{content}</Link>
            : <button key={item.id} type="button" {...props}>{content}</button>;
        })}
      </div>)}
      {!results.length && <div role="presentation" className="cwl-ui-empty-options">No matches</div>}
    </div>
  </Dialog>;
}

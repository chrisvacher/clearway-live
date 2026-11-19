"use client";

import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export type ComboboxOption = { value: string; label: string; detail?: string; group?: string; keywords?: string };

export function Combobox({ label, value, onChange, options, onQueryChange, placeholder, filter = true, busy, id, disabled, "aria-describedby": describedBy }: {
  label: string;
  value: string;
  onChange: (value: string, option: ComboboxOption) => void;
  options: readonly ComboboxOption[];
  onQueryChange?: (value: string) => void;
  placeholder?: string;
  filter?: boolean;
  busy?: boolean;
  id?: string;
  disabled?: boolean;
  "aria-describedby"?: string;
}) {
  const instance = useId();
  const listId = `${instance}-list`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const [lastPicked, setLastPicked] = useState<ComboboxOption | null>(null);
  const selected = options.find(option => option.value === value) ?? (lastPicked?.value === value ? lastPicked : null);
  const normalized = query.trim().toLocaleLowerCase();
  const matches = filter && normalized
    ? options.filter(option => [option.label, option.detail, option.keywords].filter(Boolean).join(" ").toLocaleLowerCase().includes(normalized))
    : options;
  const activeIndex = Math.max(0, Math.min(active, matches.length - 1));

  useEffect(() => {
    if (open) list.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function update(next: string) {
    setQuery(next);
    setActive(0);
    onQueryChange?.(next);
  }

  function pick(option: ComboboxOption) {
    setLastPicked(option);
    setOpen(false);
    update("");
    onChange(option.value, option);
  }

  function keyboard(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      update("");
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      const choice = matches[activeIndex];
      if (choice) pick(choice);
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActive(matches.length ? (!open ? direction === 1 ? 0 : matches.length - 1 : (activeIndex + matches.length + direction) % matches.length) : 0);
      setOpen(true);
    }
  }

  return <div className="cwl-ui-combo">
    <div className="cwl-ui-combo-input">
      <Search size={16} aria-hidden="true" />
      <input id={id} role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open}
        aria-describedby={describedBy} aria-controls={open ? listId : undefined} aria-activedescendant={open && matches.length ? `${listId}-${activeIndex}` : undefined}
        disabled={disabled} placeholder={placeholder} value={open ? query : selected?.label ?? ""}
        onFocus={() => { setOpen(true); if (selected) setActive(Math.max(0, options.indexOf(selected))); }}
        onClick={() => setOpen(true)}
        onBlur={() => { setOpen(false); update(""); }}
        onChange={event => { setOpen(true); update(event.target.value); }} onKeyDown={keyboard} />
    </div>
    {open && <div ref={list} className="cwl-ui-combo-list" role="listbox" id={listId} aria-label={label} aria-busy={busy || undefined}>
      {matches.map((option, index) => <div key={option.value} role="presentation">
        {option.group && option.group !== matches[index - 1]?.group && <div className="cwl-ui-option-group" aria-hidden="true">{option.group}</div>}
        <button type="button" role="option" aria-selected={option.value === value} tabIndex={-1} id={`${listId}-${index}`}
          className={`cwl-ui-option${index === activeIndex ? " is-active" : ""}`} onMouseDown={event => event.preventDefault()}
          onMouseEnter={() => setActive(index)} onClick={() => pick(option)}>
          <span>{option.label}</span>{option.detail && <small>{option.detail}</small>}
        </button>
      </div>)}
      {!matches.length && <div role="presentation" className="cwl-ui-empty-options">{busy ? "Searching" : "No matches"}</div>}
    </div>}
  </div>;
}

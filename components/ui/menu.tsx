"use client";

import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "./button";

export type MenuItem = {
  label: string;
  icon?: ReactNode;
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
  dividerBefore?: boolean;
};

export function Menu({ items, label = "More actions", trigger, className }: {
  items: readonly MenuItem[];
  label?: string;
  trigger?: ReactNode;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);

  const options = () => Array.from(wrapper.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);

  useLayoutEffect(() => {
    if (!open || !popup.current || !button.current) return;
    const list = popup.current;
    const trigger = button.current;
    list.showPopover();

    function position() {
      const anchor = trigger.getBoundingClientRect();
      const margin = 8;
      const gap = 4;
      const below = window.innerHeight - anchor.bottom - gap - margin;
      const above = anchor.top - gap - margin;
      const opensAbove = below < list.scrollHeight && above > below;
      list.style.maxHeight = `${Math.max(0, opensAbove ? above : below)}px`;
      const width = list.offsetWidth;
      const aligned = className === "cwl-ui-chip-menu" ? anchor.left : anchor.right - width;
      list.style.left = `${Math.max(margin, Math.min(aligned, window.innerWidth - width - margin))}px`;
      list.style.top = `${opensAbove ? anchor.top - gap - list.offsetHeight : anchor.bottom + gap}px`;
    }

    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      list.hidePopover();
    };
  }, [className, open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
    } else {
      setOpen(true);
      requestAnimationFrame(() => options().at(0)?.focus());
    }
  }

  function close() {
    button.current?.focus();
    setOpen(false);
  }

  function keyboard(event: KeyboardEvent) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowUp" || event.key === "End" ? -1 : 1;
    if (!open) {
      setOpen(true);
      requestAnimationFrame(() => options().at(direction < 0 ? -1 : 0)?.focus());
      return;
    }
    const rows = options();
    const current = rows.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "Home" ? 0
      : event.key === "End" ? rows.length - 1
      : current < 0 ? direction < 0 ? rows.length - 1 : 0
      : (current + direction + rows.length) % rows.length;
    rows[next]?.focus();
  }

  return <div ref={wrapper} className={`cwl-ui-menu ${className ?? ""}`} onKeyDown={keyboard}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    {trigger
      ? <Button ref={button} variant="quiet" size="small" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={toggle}>{trigger}</Button>
      : <Button ref={button} variant="quiet" size="small" iconOnly aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={toggle}><Ellipsis aria-hidden="true" /></Button>}
    {open && <div ref={popup} id={id} className="cwl-ui-menu-list" popover="manual" role="menu" aria-label={label}>
      {items.map(item => {
        const content = <>{item.icon}{item.label}</>;
        const props = {
          role: "menuitem",
          className: item.danger ? "is-danger" : undefined,
          "aria-disabled": item.disabled || undefined,
          tabIndex: -1,
          onClick: () => { close(); item.onSelect?.(); },
        };
        return <div key={item.label} role="none">
          {item.dividerBefore && <div role="separator" className="cwl-ui-menu-separator" />}
          {item.href && !item.disabled
            ? <Link {...props} href={item.href}>{content}</Link>
            : <button {...props} type="button" disabled={item.disabled}>{content}</button>}
        </div>;
      })}
    </div>}
  </div>;
}

"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Ellipsis, Printer, PowerOff } from "lucide-react";
import { EndWorkshop } from "./end-workshop";

// True from the first paint on the server as false; the header reads it to choose the menu (wide window) or the inline buttons (narrow).
export function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => { const q = window.matchMedia("(min-width: 901px)"), on = () => setWide(q.matches); on(); q.addEventListener("change", on); return () => q.removeEventListener("change", on); }, []);
  return wide;
}

// More: the header's quieter actions. A menu button; Escape closes it and focus returns; End the workshop keeps its confirm dialog.
export function HeaderMore({ engagement, workshop, closed }: { engagement: string; workshop: boolean; closed: boolean }) {
  const [open, setOpen] = useState(false), [asking, setAsking] = useState(false);
  const button = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const items = () => [...(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
  useEffect(() => { if (open) items()[0]?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  const close = () => { setOpen(false); button.current?.focus(); };
  function key(e: React.KeyboardEvent) {
    const list = items(), at = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); list[(at + 1) % list.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); list[(at - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); list[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); list[list.length - 1]?.focus(); }
    else if (e.key === "Tab") setOpen(false);
  }
  return <>
    <div className="ctl-more" onKeyDown={key}>
      <button ref={button} type="button" className="show-button" aria-haspopup="menu" aria-expanded={open} aria-controls="ctl-more-menu" onClick={() => setOpen(v => !v)} data-testid="header-more"><Ellipsis size={18} aria-hidden="true" />More</button>
      {open && <div ref={panel} id="ctl-more-menu" className="ctl-more-menu" role="menu" aria-label="More actions">
        <Link role="menuitem" className="ctl-more-item" href={`/admin/${engagement}/run-of-show/print`} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}><Printer size={18} aria-hidden="true" />Print run of show</Link>
        {workshop && !closed && <button role="menuitem" type="button" className="ctl-more-item" data-testid="end-workshop" onClick={() => { setOpen(false); setAsking(true); }}><PowerOff size={18} aria-hidden="true" />End the workshop</button>}
      </div>}
    </div>
    {workshop && <EndWorkshop engagement={engagement} closed={closed} viaMenu={{ open: asking, onClose: () => { setAsking(false); button.current?.focus(); } }} />}
  </>;
}

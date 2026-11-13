"use client";
import { ShellNav, type ShellEngagement } from "@/components/layout/shell-nav";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { AlignLeft, BookOpen, ChevronDown, CircleCheck, Cloud, Coins, Columns4, Copy, EyeOff, Gauge, GripVertical, Grid2x2, HandHeart, Image as ImageIcon, LayoutTemplate,
  CheckCheck, Layers, List, ListChecks, ListOrdered, Lock, MessageCircleQuestion, MessageSquareQuote, Monitor, MoreHorizontal, MousePointerClick, Newspaper, PencilLine, PenLine, Plus, Printer, ScanLine, type LucideProps } from "lucide-react";
import { parts, type Part, type RunOfShow, type SessionInput, type ShowSession } from "@/lib/run-of-show/types";
import { SessionForm, type FormDraft } from "./session-form";
import { SaveTemplate } from "./save-template";
import { contentLabels, contentOf, fallbackKinds, type ContentScreen, type InteractionKind, type KindInfo } from "@/lib/interactions/kinds";
import { canSelfPace, clock, droppedSession, endOfRun, hasSections, liveMinutes, onlyMoved, palette, partOf, partTimes, placeSession, sectionAt, sectionLine, sectionName, sectionsOf, slots, stepSlot, type PaletteEntry, type Section, type Slot } from "@/lib/run-of-show/builder";
import type { Template } from "@/lib/templates/types";
import { reducedMotion, tokenMs } from "@/lib/tv/board";
import { windowLabel } from "@/lib/run-of-show/self-paced";
import { springRate, springStep } from "@/lib/tv/motion";
import "./builder.css";

type Icon = ComponentType<LucideProps>;
const kindIcons: Partial<Record<InteractionKind, Icon>> = { word_cloud: Cloud, wall: AlignLeft, qa: MessageCircleQuestion, choice: ListChecks, scale: Gauge, ranking: ListOrdered,
  points: Coins, grid: Grid2x2, form: Lock, sign: PenLine, statements: MessageSquareQuote, content: Monitor, bullets: List, confirm: CheckCheck, four_lists: Columns4 };
const screenIcons: Record<ContentScreen, Icon> = { scripture: BookOpen, headline: Newspaper, prayer: HandHeart, image: ImageIcon, holding: Monitor, screen_check: ScanLine };
const iconOf = (kind: InteractionKind, screen?: ContentScreen | null) => kind === "content" && screen ? screenIcons[screen] : kindIcons[kind] ?? Monitor;
const stateLabels: Record<string, string> = { draft: "Draft", ready: "Ready", open: "Open", live: "Live", phones_down: "Phones down", closed: "Closed" };

const messages: Record<string, string> = {
  conflict: "Someone changed this session or its order. Your edits are still here. Reload the run of show, then reopen the session before editing.",
  running: "This session is running or already has answers. Keep its mode and interaction, or choose Nothing live before removing it.",
  closed: "This engagement has closed. Reopen it in setup before editing sessions.", denied: "Your access has changed. Sign in again to continue.",
  invalid_state: "Use the live room controls to open or close a session.", unavailable: "We couldn’t save that. Your edits are still here. Please try again.",
};
type Source = { type: "tile"; entry: PaletteEntry } | { type: "row"; session: ShowSession };
type Drag = { source: Source; gap: Slot | null; keys: boolean };
type Op = { key: string; apply: (sessions: ShowSession[]) => ShowSession[] };
const sourceLabel = (s: Source) => s.type === "tile" ? s.entry.label : s.session.title;

// Rows glide to their new places on springs (the TV's springStep), settling over
// cwl-dur-make-room. A row keeps its speed when the gap moves again mid-glide. Reduced
// motion puts every row in place at once.
function useGlide(root: RefObject<HTMLElement | null>, key: string) {
  const items = useRef(new Map<string, { top: number; x: number; v: number; el: HTMLElement }>());
  const lastKey = useRef(key), raf = useRef(0), last = useRef(0);
  const tick = useCallback((now: number) => {
    const el = root.current; raf.current = 0; if (!el) return;
    const dt = Math.min(0.05, (now - last.current) / 1000), omega = springRate(tokenMs(el, "cwl-dur-make-room") || 700); last.current = now;
    let moving = false;
    for (const s of items.current.values()) {
      if (Math.abs(s.x) < 0.5 && Math.abs(s.v) < 5) { s.x = 0; s.v = 0; s.el.style.transform = ""; continue; }
      [s.x, s.v] = springStep(s.x, s.v, 0, omega, dt); s.el.style.transform = `translateY(${s.x.toFixed(2)}px)`; moving = true;
    }
    if (moving) raf.current = requestAnimationFrame(tick);
  }, [root]);
  const measure = useCallback((animate: boolean) => {
    const el = root.current; if (!el) return;
    const still = reducedMotion(el), seen = new Set<string>();
    el.querySelectorAll<HTMLElement>("[data-glide]").forEach(node => {
      const id = node.dataset.glide!, top = node.offsetTop, s = items.current.get(id); seen.add(id);
      if (!s) { items.current.set(id, { top, x: 0, v: 0, el: node }); return; }
      if (still) { s.x = 0; s.v = 0; node.style.transform = ""; } else if (animate) s.x += s.top - top;
      s.top = top; s.el = node;
    });
    for (const id of [...items.current.keys()]) if (!seen.has(id)) items.current.delete(id);
    if (!still && !raf.current && [...items.current.values()].some(s => s.x)) { last.current = performance.now(); raf.current = requestAnimationFrame(tick); }
  }, [root, tick]);
  useLayoutEffect(() => { measure(key !== lastKey.current); lastKey.current = key; });
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return measure;
}

// A section's header: its name, edited in place, its count and length, and its menu. A section is the run of sessions under it.
function SectionHead({ name, line, locked, onRename, onBlock }: { name: string; line: string; locked: boolean; onRename: (name: string) => void; onBlock: () => void }) {
  const [value, setValue] = useState(name), menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => setValue(name), [name]);
  const commit = () => { const next = value.replace(/\s+/g, " ").trim(); if (next !== name) onRename(next); else setValue(name); };
  const act = (run: () => void) => { if (menu.current) menu.current.open = false; run(); };
  return <div className="rb-sec-head">
    <input aria-label="Section name" placeholder="Name this section" maxLength={100} value={value} disabled={locked} onChange={e => setValue(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } else if (e.key === "Escape") setValue(name); }} />
    <span className="show-muted">{line}</span>
    <details className="rb-sec-menu" ref={menu}><summary aria-label={`More actions for ${name || "this section"}`}><MoreHorizontal size={18} aria-hidden="true" /></summary>
      <div><button type="button" disabled={locked} onClick={() => act(onBlock)}>Save as a block</button>
        {name && <button type="button" disabled={locked} onClick={() => act(() => onRename(""))}>Remove the section name</button>}</div></details>
  </div>;
}

export function ShowEditor({ initial, notice = "", fourLists = true, shell = null }: { initial: RunOfShow; notice?: string; fourLists?: boolean; shell?: ShellEngagement | null }) {
  const [show, setShow] = useState(initial), [pending, setPending] = useState<Op[]>([]);
  const [message, setMessage] = useState(notice), [error, setError] = useState(false), [reloadNeeded, setReloadNeeded] = useState(false), [announce, setAnnounce] = useState("");
  const [openId, setOpenId] = useState<string | null>(null), [closingId, setClosingId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null), [formFeedback, setFormFeedback] = useState<{ text: string; failed: boolean }>({ text: "", failed: false });
  const [dropMode, setDropMode] = useState<"live" | "self_paced">("live");
  const [dirty, setDirty] = useState<Set<string>>(() => new Set()), [drag, setDrag] = useState<Drag | null>(null), [saveTemplate, setSaveTemplate] = useState(false);
  // Sections and saved blocks (design pass 8, step 5). A new section is kept once a session lands in it.
  const [pendingSection, setPendingSection] = useState<{ part: Part; name: string } | null>(null), [adding, setAdding] = useState<{ part: Part; name: string } | null>(null);
  const [blockOf, setBlockOf] = useState<{ name: string; ids: string[] } | null>(null), [paletteTab, setPaletteTab] = useState<"elements" | "blocks">("elements");
  const [blocks, setBlocks] = useState<Template[] | null>(null), [blockBusy, setBlockBusy] = useState<string | null>(null);
  // The session as it was when its options opened (the form's starting point), the server
  // copy an open editor saves against, and unsaved edits kept while options are closed.
  const latest = useRef(show), queue = useRef(Promise.resolve()), drafts = useRef(new Map<string, FormDraft>()), bases = useRef(new Map<string, ShowSession>()), snapshots = useRef(new Map<string, ShowSession>());
  const nextOpen = useRef<string | null>(null), closeTimer = useRef(0), dragRef = useRef(drag), ghost = useRef<HTMLDivElement>(null), runRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null), settleUntil = useRef(0);
  dragRef.current = drag;
  const ctx = show.context, base = `/setup/${ctx.id}`, endpoint = `/api/run-of-show/${ctx.id}`;
  const kinds: KindInfo[] = ctx.kinds?.length ? ctx.kinds : Object.values(fallbackKinds);
  const tiles = useMemo(() => palette(kinds), [kinds]);
  const sessions = useMemo(() => pending.reduce((list, op) => op.apply(list), show.sessions), [pending, show.sessions]);
  const locked = ctx.closed || reloadNeeded;
  const panelMs = () => runRef.current && !reducedMotion(runRef.current) ? tokenMs(runRef.current, "cwl-dur-panel") || 300 : 0;

  async function load() {
    const response = await fetch(endpoint, { cache: "no-store" }); if (!response.ok) throw new Error("load");
    return await response.json() as RunOfShow;
  }
  // Every change goes to the server one at a time, in order. What is on screen is the
  // server's run of show with the changes still on their way applied on top, so a drop
  // lands at once and nothing jumps when the server answers.
  function enqueue(apply: Op["apply"], request: (current: RunOfShow) => { action: string; input: unknown } | null, after?: (ok: boolean) => void) {
    const op: Op = { key: crypto.randomUUID(), apply };
    setPending(list => [...list, op]);
    queue.current = queue.current.then(async () => {
      let ok = false;
      try {
        const body = request(latest.current);
        if (!body) ok = true;
        else {
          const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          const result = await response.json().catch(() => ({}));
          ok = response.ok && result.status === "ok";
          if (!ok) { setError(true); setMessage(result.message || messages[result.status] || "Check the session details and try again."); }
        }
      } catch { setError(true); setMessage(messages.unavailable); }
      try { const next = await load(); latest.current = next; setShow(next); }
      catch { setReloadNeeded(true); setError(true); setMessage("Saved. Reload the run of show to see your changes."); }
      setPending(list => list.filter(x => x.key !== op.key));
      after?.(ok);
    });
  }
  async function reload() {
    try { const next = await load(); latest.current = next; setShow(next); setReloadNeeded(false); setError(false); setMessage("Run of show reloaded. Close and reopen a session to load its latest edits."); }
    catch { setError(true); setMessage("We couldn’t load the run of show. Please try again."); }
  }

  // An open editor follows its session when the server only moved it or worked out a new
  // start for it; a real edit elsewhere leaves it on its own revision, so Done reports it.
  useEffect(() => {
    for (const id of new Set([...(openId ? [openId] : []), ...drafts.current.keys()])) {
      const server = show.sessions.find(s => s.id === id), had = bases.current.get(id);
      if (!server) continue;
      if (!had || onlyMoved(had, server)) bases.current.set(id, server);
    }
  }, [show, openId]);

  // Options open and close in place. Another session's options slide closed first.
  // Refs as well as state: a change that finishes later must see where the options are now.
  const openRef = useRef<string | null>(null), closingRef = useRef<string | null>(null), pendingOpen = useRef<string | null>(null);
  const setOpen = (id: string | null) => { openRef.current = id; setOpenId(id); };
  const setClosing = (id: string | null) => { closingRef.current = id; setClosingId(id); };
  const openSoon = (id: string) => { pendingOpen.current = id; requestAnimationFrame(() => { if (pendingOpen.current === id) { pendingOpen.current = null; setOpen(id); } }); };
  const finishClose = () => {
    const was = closingRef.current; if (was) snapshots.current.delete(was);
    setClosing(null);
    const id = nextOpen.current; nextOpen.current = null;
    if (id) openSoon(id);
  };
  function openOptions(id: string | null) {
    if (id === openRef.current && !closingRef.current) return;
    setFormFeedback({ text: "", failed: false });
    if (openRef.current) {
      setClosing(openRef.current); setOpen(null); nextOpen.current = id;
      window.clearTimeout(closeTimer.current); closeTimer.current = window.setTimeout(finishClose, panelMs() + 40);
      settleUntil.current = performance.now() + panelMs() + 40;
    } else if (closingRef.current) nextOpen.current = id;
    else if (id) openSoon(id);
    else pendingOpen.current = null;
  }
  // Close one session's options, only if they are still the ones open (or about to open).
  function closeOptions(id: string) {
    if (openRef.current === id) openOptions(null);
    if (nextOpen.current === id) nextOpen.current = null;
    if (pendingOpen.current === id) pendingOpen.current = null;
  }
  useEffect(() => {
    if (!openId) return;
    const t = window.setTimeout(() => document.querySelector(`[data-row="${openId}"]`)?.scrollIntoView({ block: "nearest", behavior: panelMs() ? "smooth" : "auto" }), panelMs() + 20);
    return () => window.clearTimeout(t);
  }, [openId]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  const onDraft = useCallback((id: string, d: FormDraft, isDirty: boolean) => {
    if (isDirty) drafts.current.set(id, d); else drafts.current.delete(id);
    setDirty(set => set.has(id) === isDirty ? set : (() => { const next = new Set(set); if (isDirty) next.add(id); else next.delete(id); return next; })());
  }, []);
  const forget = (id: string) => { drafts.current.delete(id); bases.current.delete(id); if (id !== openRef.current && id !== closingRef.current) snapshots.current.delete(id); setDirty(set => { if (!set.has(id)) return set; const next = new Set(set); next.delete(id); return next; }); };

  // ---------- Changes ----------
  function insert(entry: PaletteEntry, slot: Slot) {
    const section = slot.section ?? sectionAt(sessions, slot.part, slot.index);
    const s = { ...droppedSession(entry, ctx.id, slot.part, kinds, crypto.randomUUID(), dropMode), section };
    if (pendingSection && pendingSection.part === slot.part && pendingSection.name === section) setPendingSection(null);
    enqueue(list => placeSession(list, s, slot.part, slot.index), () => ({ action: "save", input: { ...s, revision: null, index: slot.index } }),
      ok => { if (!ok) { forget(s.id); if (nextOpen.current === s.id) nextOpen.current = null; if (pendingOpen.current === s.id) pendingOpen.current = null; if (openRef.current === s.id) setOpen(null); } });
    openOptions(s.id);
    setAnnounce(`${entry.label} added to ${section || slot.part}, position ${slot.index + 1}. Its options are open.`);
  }
  function place(session: ShowSession, slot: Slot) {
    const rest = partOf(sessions.filter(s => s.id !== session.id), slot.part);
    const now = partOf(sessions, session.part).findIndex(s => s.id === session.id);
    const section = slot.section ?? sectionAt(sessions, slot.part, slot.index, session.id);
    if (slot.part === session.part && slot.index === now && section === sectionName(session)) return;
    if (pendingSection && pendingSection.part === slot.part && pendingSection.name === section) setPendingSection(null);
    enqueue(list => { const s = list.find(x => x.id === session.id); return s ? placeSession(list, { ...s, section }, slot.part, slot.index) : list; },
      current => { const cur = current.sessions.find(x => x.id === session.id); return cur ? { action: "place", input: { id: cur.id, revision: cur.revision, part: slot.part, index: slot.index, section } } : null; });
    setAnnounce(`${session.title} moved to ${section || slot.part}, position ${Math.min(slot.index, rest.length) + 1}.`);
  }
  // Rename a section, or take its name away: every session in it takes the new name.
  function renameSection(sec: Section, name: string) {
    const ids = new Set(sec.sessions.map(x => x.id));
    enqueue(list => list.map(x => ids.has(x.id) ? { ...x, section: name } : x),
      current => { const here = current.sessions.filter(x => ids.has(x.id)).map(x => x.id); return here.length ? { action: "section", input: { ids: here, section: name } } : null; },
      ok => { if (ok) { setError(false); setMessage(name ? `Section named ${name}.` : "Section name removed. Its sessions stay."); } });
  }
  // Clicking an element adds it at the end of the run, or in the section just added.
  const endSlot = (): Slot => pendingSection ? { part: pendingSection.part, index: partOf(sessions, pendingSection.part).length, section: pendingSection.name } : endOfRun(sessions);
  async function loadBlocks() {
    try { const response = await fetch("/api/templates", { cache: "no-store" }), data = await response.json() as { templates?: Template[] }; setBlocks(response.ok ? (data.templates ?? []).filter(t => t.block) : []); }
    catch { setBlocks([]); }
  }
  // A saved block adds its sessions at the end of the part it was saved from, after every change still on its way.
  function addBlock(t: Template) {
    setBlockBusy(t.id);
    queue.current = queue.current.then(async () => {
      try {
        const response = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply", input: { template: t.id, engagement: ctx.id } }) });
        const result = await response.json().catch(() => ({}));
        if (response.ok && result.status === "ok") { setError(false); setMessage(`${t.name} added: ${result.count} ${result.count === 1 ? "session" : "sessions"} at the end of the run.`); }
        else { setError(true); setMessage(result.message || "We couldn’t add that block. Please try again."); }
        const next = await load(); latest.current = next; setShow(next);
      } catch { setError(true); setMessage(messages.unavailable); }
      setBlockBusy(null);
    });
  }
  async function removeBlock(t: Template) {
    if (!window.confirm(`Remove ${t.name}? Runs it was added to keep their sessions.`)) return;
    try {
      const response = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove", input: { template: t.id } }) });
      if (!response.ok) throw new Error("remove");
      setBlocks(list => list?.filter(x => x.id !== t.id) ?? null); setError(false); setMessage(`${t.name} removed.`);
    } catch { setError(true); setMessage("We couldn’t remove that block. Please try again."); }
  }
  function remove(session: ShowSession) {
    closeOptions(session.id); forget(session.id);
    enqueue(list => list.filter(s => s.id !== session.id), current => { const cur = current.sessions.find(x => x.id === session.id); return cur ? { action: "remove", input: { id: cur.id, revision: cur.revision } } : null; },
      ok => { if (ok) { setError(false); setMessage("Session removed."); } });
  }
  // After Done, focus goes back to the row's toggle, without scrolling, and only if focus is
  // still in that session's options (or nowhere): a facilitator who has already picked up
  // another tile or moved on keeps their place, and the run never jumps under the pointer.
  function returnFocus(id: string) {
    const row = document.querySelector<HTMLElement>(`[data-row="${id}"]`), active = document.activeElement;
    if (!row || dragRef.current || (active && active !== document.body && !row.contains(active))) return;
    row.querySelector<HTMLButtonElement>(".rb-tog")?.focus({ preventScroll: true });
  }
  function done(value: SessionInput) {
    const id = value.id; setSaving(id); setFormFeedback({ text: "", failed: false });
    return new Promise<void>(resolve => {
      enqueue(list => list.map(s => s.id === id ? { ...s, ...value, revision: s.revision } : s),
        current => { const server = current.sessions.find(x => x.id === id), had = bases.current.get(id);
          const { section, ...rest } = value, changed = section !== undefined && section !== sectionName(snapshots.current.get(id) ?? server ?? ({} as ShowSession));
          return { action: "save", input: { ...(changed ? value : rest), revision: had ? had.revision : server?.revision ?? null } }; },
        ok => {
          setSaving(null);
          if (ok) { forget(id); setError(false); setMessage("Session saved."); const focused = openRef.current === id; closeOptions(id); if (focused) requestAnimationFrame(() => returnFocus(id)); }
          else setFormFeedback({ text: messages.conflict, failed: true });
          resolve();
        });
    });
  }

  // ---------- Dragging, by pointer or keyboard ----------
  const findGap = useCallback((x: number, y: number, source: Source): Slot | null => {
    const run = runRef.current; if (!run || performance.now() < settleUntil.current) return null;
    const box = run.getBoundingClientRect();
    if (x < box.left - 24 || x > box.right + 24 || y < box.top - 48 || y > box.bottom + 64) return null;
    // Places are read from the run as it would be without the open gap, so the gap never
    // chases the pointer: the same pointer position always picks the same place.
    const slot = run.querySelector<HTMLElement>(".rb-slot"), style = slot ? getComputedStyle(slot) : null;
    const slotTop = slot ? slot.offsetTop : Infinity, shift = slot && style ? slot.offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom) : 0;
    const at = (el: HTMLElement) => box.top + el.offsetTop - (el.offsetTop > slotTop ? shift : 0);
    const sections = [...run.querySelectorAll<HTMLElement>("[data-part]")];
    let best: HTMLElement | null = null, distance = Infinity;
    for (const el of sections) {
      const top = at(el), bottom = top + el.offsetHeight - (el.contains(slot) ? shift : 0);
      const d = y < top ? top - y : y > bottom ? y - bottom : 0;
      if (d < distance) { distance = d; best = el; }
    }
    if (!best) return null;
    const part = best.dataset.part as Part, moving = source.type === "row" ? source.session.id : null;
    const rows = [...best.querySelectorAll<HTMLElement>("[data-row]")].filter(el => el.dataset.row !== moving);
    let index = rows.length;
    for (let i = 0; i < rows.length; i++) { const top = at(rows[i]), h = rows[i].querySelector<HTMLElement>(".rb-head")?.offsetHeight ?? rows[i].offsetHeight; if (y < top + h / 2) { index = i; break; } }
    // Between two sections the same place belongs to either: above the lower section's header it joins the one above, below it the one below.
    const heads = [...best.querySelectorAll<HTMLElement>("[data-sec-head]")];
    if (!heads.length) return { part, index };
    const below = rows[index], above = rows[index - 1];
    const headOf = (el: Element) => { let prev = el.previousElementSibling as HTMLElement | null; while (prev && (prev.classList.contains("rb-slot") || (prev.dataset.row && prev.dataset.row === moving))) prev = prev.previousElementSibling as HTMLElement | null; return prev && prev.dataset.secHead !== undefined ? prev : null; };
    let section: string;
    if (below) { const h = headOf(below); section = h && (!above || y >= at(h) + h.offsetHeight / 2) ? h.dataset.secName ?? "" : (above ?? below).dataset.sec ?? ""; }
    else { const last = heads[heads.length - 1], after = !above || Boolean(above.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING); section = after && (!above || y >= at(last)) ? last.dataset.secName ?? "" : above?.dataset.sec ?? ""; }
    return { part, index, section };
  }, []);
  function begin(source: Source, keys: boolean, gap: Slot | null = null) {
    openOptions(null);
    setDrag({ source, gap, keys });
    setAnnounce(keys ? `${sourceLabel(source)} picked up. Use the up and down arrows to choose where it goes, Enter to drop it, Escape to cancel.` : "");
  }
  function finish(drop: boolean) {
    const d = dragRef.current; setDrag(null);
    if (!d) return;
    if (!drop || !d.gap) { if (d.keys) setAnnounce(`${sourceLabel(d.source)} put back.`); return; }
    if (d.source.type === "tile") insert(d.source.entry, d.gap); else place(d.source.session, d.gap);
  }
  function pointerStart(e: ReactPointerEvent, source: Source) {
    if (e.button !== 0 || locked || dragRef.current) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY; let started = false;
    const moveGhost = (x: number, y: number) => { if (ghost.current) ghost.current.style.transform = `translate(${x + 14}px, ${y + 14}px)`; };
    const move = (ev: PointerEvent) => {
      if (!started) { if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 6) return; started = true; begin(source, false); }
      pointer.current = { x: ev.clientX, y: ev.clientY }; moveGhost(ev.clientX, ev.clientY);
      const gap = findGap(ev.clientX, ev.clientY, source);
      setDrag(d => d && (d.gap?.part !== gap?.part || d.gap?.index !== gap?.index || d.gap?.section !== gap?.section) ? { ...d, gap } : d);
      if (ev.clientY < 72) window.scrollBy(0, -14); else if (ev.clientY > window.innerHeight - 72) window.scrollBy(0, 14);
    };
    const stop = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", cancel); document.removeEventListener("keydown", key); pointer.current = null; };
    const up = () => { stop(); if (!started) { if (source.type === "tile") insert(source.entry, endSlot()); return; } finish(true); };
    const cancel = () => { stop(); if (started) finish(false); };
    const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.preventDefault(); cancel(); } };
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up); document.addEventListener("pointercancel", cancel); document.addEventListener("keydown", key);
  }
  // The dragged tile follows the pointer (moved directly, not by rendering).
  useLayoutEffect(() => { const p = pointer.current; if (ghost.current && p) ghost.current.style.transform = `translate(${p.x + 14}px, ${p.y + 14}px)`; }, [drag?.source]);
  // Once the open options have slid closed, the gap opens under the pointer.
  useEffect(() => {
    if (!drag || drag.keys || drag.gap) return;
    const t = window.setTimeout(() => {
      const p = pointer.current, d = dragRef.current; if (!p || !d) return;
      const gap = findGap(p.x, p.y, d.source); if (gap) setDrag(x => x ? { ...x, gap } : x);
    }, Math.max(0, settleUntil.current - performance.now()) + 20);
    return () => window.clearTimeout(t);
  }, [drag, closingId, findGap]);
  // The keyboard's pick up, move and drop.
  useEffect(() => {
    if (!drag?.keys) return;
    const moving = drag.source.type === "row" ? drag.source.session.id : undefined;
    const all = slots(sessions, moving);
    const key = (ev: KeyboardEvent) => {
      const d = dragRef.current; if (!d) return;
      if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
        ev.preventDefault(); ev.stopPropagation();
        const next = stepSlot(all, d.gap ?? all[all.length - 1], ev.key === "ArrowUp" ? -1 : 1);
        const moved = { ...d, gap: next }; dragRef.current = moved; setDrag(moved);
        setAnnounce(`${next.part}, position ${next.index + 1} of ${all.filter(s => s.part === next.part).length}.`);
      } else if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ev.stopPropagation(); finish(true); }
      else if (ev.key === "Escape" || ev.key === "Tab") { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); } finish(false); }
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.keys, drag?.source, sessions]);
  function tileKey(e: ReactKeyboardEvent, entry: PaletteEntry) {
    if (locked || dragRef.current) return;
    if (e.key === "Enter") { e.preventDefault(); insert(entry, endSlot()); }
    else if (e.key === " ") { e.preventDefault(); begin({ type: "tile", entry }, true, endOfRun(sessions)); }
  }
  function gripKey(e: ReactKeyboardEvent, s: ShowSession) {
    if (locked || dragRef.current || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault(); e.stopPropagation();
    begin({ type: "row", session: s }, true, { part: s.part, index: partOf(sessions, s.part).findIndex(x => x.id === s.id) });
  }

  // ---------- Drawing ----------
  const moving = drag?.source.type === "row" ? drag.source.session.id : null;
  const glideKey = parts.map(p => `${p}:${partOf(sessions, p).map(s => `${s.id}${sectionName(s) ? `~${sectionName(s)}` : ""}`).join(",")}`).join("|") + (drag?.gap ? `#${drag.gap.part}:${drag.gap.index}:${drag.gap.section ?? ""}` : "") + (pendingSection ? `+${pendingSection.part}:${pendingSection.name}` : "");
  useEffect(() => { if (paletteTab === "blocks" && blocks === null) void loadBlocks(); }, [paletteTab, blocks]);
  const remeasure = useGlide(runRef, glideKey);
  const tz = ctx.timezone, hour = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour: "numeric", minute: "2-digit" }), [tz]);
  const kindLabel = (s: ShowSession) => s.interaction === "content" ? contentLabels[contentOf(s.options).screen] : kinds.find(k => k.kind === s.interaction)?.label ?? fallbackKinds[s.interaction]?.label ?? s.interaction;
  const total = liveMinutes(sessions), count = sessions.length, empty = count === 0;
  const slotEl = (part: Part) => {
    if (!drag?.gap || drag.gap.part !== part) return null;
    const label = drag.source.type === "tile" ? drag.source.entry.label : drag.source.session.title;
    const SlotIcon = drag.source.type === "tile" ? iconOf(drag.source.entry.kind, drag.source.entry.screen) : iconOf(drag.source.session.interaction, contentOf(drag.source.session.options).screen);
    return <li key="slot" className="rb-slot" data-glide="slot" aria-hidden="true"><span><SlotIcon aria-hidden="true" />Drop {label} here</span></li>;
  };
  const snapshot = (s: ShowSession) => { const had = snapshots.current.get(s.id); if (had) return had; snapshots.current.set(s.id, s); return s; };
  const DragIcon = drag ? drag.source.type === "tile" ? iconOf(drag.source.entry.kind, drag.source.entry.screen) : iconOf(drag.source.session.interaction, contentOf(drag.source.session.options).screen) : null;

  return <main id="main" className="show-app">
    <ShellNav engagement={shell ?? { id: ctx.id, title: ctx.title, church: ctx.church, type: "wayfinding" }} fourLists={sessions.some(x => x.interaction === "four_lists")} />
    <div className="show-workspace">
      <div className="show-private"><EyeOff size={15} aria-hidden="true" />Only you see this</div>
      <header className="show-header"><div><p className="show-eyebrow">{ctx.church} · {ctx.title}</p><h1>Run of show</h1></div><div className="show-actions">
        {!empty && <span className="show-muted" aria-live="polite">{count} {count === 1 ? "session" : "sessions"} · {clock(total)}</span>}
        <button className="show-button" type="button" disabled={empty || locked || pending.length > 0} onClick={() => setSaveTemplate(true)}><Copy size={18} aria-hidden="true" />Save as template</button>
        <Link className="show-button" href={`/setup/templates?engagement=${ctx.id}`}><LayoutTemplate size={18} aria-hidden="true" />Use a template</Link>
        <Link className="show-button" href={`${base}/run-of-show/print`} target="_blank" rel="noreferrer"><Printer size={18} aria-hidden="true" />Print run of show</Link>
      </div></header>
      <div className="show-toolbar"><span>Times in {tz}. Each session starts when the one before it ends.</span><button className="show-button" type="button" onClick={() => void reload()}>Reload run of show</button></div>
      {message && <div className={`show-message${error ? " is-error" : ""}`} role={error ? "alert" : "status"}>{message}</div>}
      {ctx.closed && <p className="show-message">This engagement has closed. You can read and print its run of show.</p>}
      <p className="sr-only" aria-live="assertive">{announce}</p>
      <p className="sr-only" id="rb-move-help">Press Space or Enter to pick it up, then the up and down arrows to move it.</p>
      <div className="rb-body">
        <div className="rb-run" ref={runRef} onTransitionEnd={e => { if ((e.target as HTMLElement).classList.contains("rb-opts")) remeasure(false); }}>
          {parts.filter(part => part !== "Discover" || fourLists || partOf(sessions, part).length > 0).map(part => {
            const group = partOf(sessions, part), times = partTimes(group), timed = group.some(s => s.mode === "live" && s.planned_start);
            const firstLive = group.find(s => s.mode === "live")?.id, target = drag?.gap?.part === part;
            // Sections: a part with a named section shows a header over each run of sessions that share a name.
            const pending = pendingSection?.part === part ? pendingSection.name : null, named = hasSections(group) || pending !== null;
            const gapSection = target ? drag!.gap!.section ?? sectionAt(sessions, part, drag!.gap!.index, moving ?? undefined) : null;
            let shown = 0;
            const rows = sectionsOf(group).flatMap(sec => { let headed = !named; const head = () => { if (headed) return []; headed = true;
              return [<li key={`sec:${sec.key}`} className="rb-sec" data-glide={`s:${sec.key}`} data-sec-head="" data-sec-name={sec.name}>
                <SectionHead name={sec.name} line={sectionLine(sec.sessions)} locked={locked} onRename={name => renameSection(sec, name)} onBlock={() => setBlockOf({ name: sec.name || ctx.title, ids: sec.sessions.map(x => x.id) })} /></li>]; };
             return sec.sessions.flatMap(s => {
              const out = [];
              if (s.id !== moving) { if (target && drag!.gap!.index === shown) { if (!headed && gapSection !== sec.name) out.push(slotEl(part), ...head()); else out.push(...head(), slotEl(part)); } shown++; }
              out.push(...head());
              const open = s.id === openId, mounted = open || s.id === closingId, t = times.get(s.id), Kind = iconOf(s.interaction, contentOf(s.options).screen);
              const time = s.mode !== "live" ? "Self-paced" : t?.at ? hour.format(new Date(t.at)) : clock(t?.offset ?? 0);
              const StateIcon = s.state === "draft" ? PencilLine : CircleCheck;
              const toggle = () => { if (!dragRef.current) openOptions(open ? null : s.id); };
              out.push(<li key={s.id} data-row={s.id} data-sec={sec.name} data-glide={s.id} className={`rb-row${open ? " is-open" : ""}${s.id === moving ? " is-moving" : ""}`}>
                <div className="rb-head" onClick={e => { if (!(e.target as HTMLElement).closest("button")) toggle(); }}>
                  <button type="button" className="rb-grip" aria-label={`Move ${s.title}`} aria-describedby="rb-move-help" disabled={locked} onPointerDown={e => pointerStart(e, { type: "row", session: s })} onKeyDown={e => gripKey(e, s)}><GripVertical size={18} aria-hidden="true" /></button>
                  <span className="rb-time">{time}</span>
                  <span className="rb-ic"><Kind aria-hidden="true" /></span>
                  <div className="rb-name"><strong>{s.title}</strong><span className="show-muted">{kindLabel(s)} · {s.mode === "live" ? `${s.planned_minutes} min` : windowLabel(s, tz, Date.now()) || "Set its times"}</span></div>
                  {dirty.has(s.id) && !open && <span className="rb-chip is-unsaved">Unsaved edits</span>}
                  <span className={`rb-chip is-${s.state}`}><StateIcon aria-hidden="true" />{stateLabels[s.state] ?? s.state}</span>
                  <button type="button" className="rb-tog" aria-expanded={open} aria-label={`${open ? "Close" : "Open"} options for ${s.title}`} onClick={toggle}><ChevronDown size={20} aria-hidden="true" /></button>
                </div>
                <div className="rb-opts"><div className="rb-clip">{mounted && <SessionForm key={s.id} variant="inline" session={snapshot(s)} fresh={false} context={ctx} others={sessions} fourLists={fourLists}
                  busy={saving === s.id} blocked={locked || !open} feedback={open ? formFeedback.text : ""} failed={formFeedback.failed}
                  revision={bases.current.get(s.id)?.revision} draft={drafts.current.get(s.id)} onDraft={(d, isDirty) => onDraft(s.id, d, isDirty)}
                  startNote={s.mode !== "live" ? "Self-paced: it opens and closes on phones at its own times and takes no room time." : s.id !== firstLive ? (timed && t?.at ? `Starts at ${hour.format(new Date(t.at))}, from the lengths before it.` : `Starts ${clock(t?.offset ?? 0)} into ${part}, from the lengths before it.`) : undefined}
                  onSave={done} onClose={() => closeOptions(s.id)} onRemove={() => remove(s)} />}</div></div>
              </li>);
              return out;
            }); });
            const pendingHead = pending !== null ? <li key="sec:pending" className="rb-sec is-pending" data-glide={`s:pending:${part}`} data-sec-head="" data-sec-name={pending}>
              <div className="rb-sec-head"><strong>{pending}</strong><span className="show-muted">Click an element to add it here, or drag one in.</span>
                <button type="button" className="show-button is-small" onClick={() => setPendingSection(null)}>Cancel</button></div></li> : null;
            if (target && drag!.gap!.index >= shown) { if (pendingHead && gapSection === pending) rows.push(pendingHead, slotEl(part)); else { rows.push(slotEl(part)); if (pendingHead) rows.push(pendingHead); } }
            else if (pendingHead) rows.push(pendingHead);
            return <section key={part} className="rb-part" data-part={part} aria-labelledby={`part-${part}`}>
              <h2 id={`part-${part}`} data-glide={`h:${part}`}>{part}<span>{group.length ? `${group.length} ${group.length === 1 ? "session" : "sessions"} · ${clock(liveMinutes(group))}` : "No sessions"}</span></h2>
              <ol className={`rb-list${target ? " is-target" : ""}${!group.length && !target && pending === null ? " is-empty" : ""}`} aria-label={part}>
                {rows}
                {!group.length && !target && pending === null && (empty && part === "Day 1"
                  ? <li className="rb-empty is-start" data-glide={`e:${part}`}><MousePointerClick aria-hidden="true" /><b>Start the run</b><span>Drag an interaction or content screen here from the right, or click one to add it at the end.</span><Link className="show-button" href={`/setup/templates?engagement=${ctx.id}`}><LayoutTemplate size={18} aria-hidden="true" />Start from a template</Link></li>
                  : <li className="rb-empty" data-glide={`e:${part}`}>Drop a session here to add it to {part}.</li>)}
              </ol>
              {!locked && (adding?.part === part
                ? <form className="rb-sec-add" onSubmit={e => { e.preventDefault(); const name = adding.name.replace(/\s+/g, " ").trim(); if (name) { setPendingSection({ part, name }); setAdding(null); setAnnounce(`${name} added to ${part}. Click an element to add it there.`); } }}>
                    <label htmlFor={`sec-new-${part}`}>New section name</label><input id={`sec-new-${part}`} autoFocus maxLength={100} value={adding.name} onChange={e => setAdding({ part, name: e.target.value })} />
                    <button type="submit" className="show-button is-primary is-small" disabled={!adding.name.trim()}>Add section</button><button type="button" className="show-button is-small" onClick={() => setAdding(null)}>Cancel</button></form>
                : (group.length > 0 || part === "Day 1") && pending === null && <button type="button" className="rb-sec-new" onClick={() => setAdding({ part, name: "" })}><Plus size={16} aria-hidden="true" />Add a section<span className="sr-only"> to {part}</span></button>)}
            </section>;
          })}
        </div>
        <aside className="rb-palette" aria-labelledby="rb-palette-title">
          <div className="rb-palette-head"><p>Add to the run</p><h2 id="rb-palette-title">{paletteTab === "blocks" ? "Click a block to add it at the end" : "Drag into place, or click to add at the end"}</h2>
            <div className="rb-mode" role="radiogroup" aria-label="What to add">{([["elements", "Elements"], ["blocks", "Saved blocks"]] as const).map(([value, label]) =>
              <button key={value} type="button" role="radio" aria-checked={paletteTab === value} className={paletteTab === value ? "is-on" : ""} onClick={() => setPaletteTab(value)}>{label}</button>)}</div>
            {paletteTab === "elements" && <><div className="rb-mode" role="radiogroup" aria-label="Add sessions as">{([["live", "Live in the room"], ["self_paced", "Self-paced"]] as const).map(([value, label]) =>
              <button key={value} type="button" role="radio" aria-checked={dropMode === value} className={dropMode === value ? "is-on" : ""} onClick={() => setDropMode(value)}>{label}</button>)}</div>
            {dropMode === "self_paced" && <p className="rb-help">Self-paced sessions open on phones between two times, outside the live room. Set the times, then press Done.</p>}</>}</div>
          {paletteTab === "blocks" ? <div className="rb-palette-body" data-testid="saved-blocks">
            <div className="rb-group" role="group" aria-label="Your blocks"><h3>Your blocks</h3>
              {blocks === null ? <p className="rb-help" role="status">Loading your blocks.</p> : blocks.length === 0 ? <p className="rb-help">No blocks yet. To save one, open a section&rsquo;s menu and choose Save as a block.</p>
                : blocks.map(t => <div key={t.id} className="rb-block">
                  <button type="button" className="rb-tile" disabled={locked || blockBusy !== null} onClick={() => addBlock(t)}>
                    <span className="ic"><Layers size={18} aria-hidden="true" /></span><span className="tx"><b>{t.name}</b><span>{blockBusy === t.id ? "Adding" : `${t.count} ${t.count === 1 ? "session" : "sessions"} · ${clock(t.minutes)}`}</span></span></button>
                  {t.can_remove && <button type="button" className="rb-block-remove" aria-label={`Remove ${t.name}`} disabled={blockBusy !== null} onClick={() => void removeBlock(t)}>Remove</button>}</div>)}
            </div>
            <p className="rb-help">A block lands at the end of the part it was saved from, with its section names. For a whole run, <Link className="text-link" href={`/setup/templates?engagement=${ctx.id}`}>use a template</Link>.</p>
          </div> : <div className="rb-palette-body">
            {([["Interactions", tiles.interactions], ["Content screens", tiles.screens]] as const).map(([title, list]) => list.length > 0 && <div className="rb-group" key={title} role="group" aria-label={title}>
              <h3>{title}{title === "Content screens" && dropMode === "self_paced" ? ": in the room only" : ""}</h3>
              {list.map(entry => { const TileIcon = iconOf(entry.kind, entry.screen); const lifted = drag?.source.type === "tile" && drag.source.entry.id === entry.id;
                return <button type="button" key={entry.id} className={`rb-tile${lifted ? " is-lifted" : ""}`} disabled={locked || (dropMode === "self_paced" && !canSelfPace(entry))} aria-describedby="rb-tile-help"
                  onPointerDown={e => pointerStart(e, { type: "tile", entry })} onKeyDown={e => tileKey(e, entry)} onClick={e => e.preventDefault()}>
                  <span className="ic"><TileIcon size={18} aria-hidden="true" /></span><span className="tx"><b>{entry.label}</b><span>{entry.blurb}</span></span><span className="grip"><GripVertical size={16} aria-hidden="true" /></span>
                </button>; })}
            </div>)}
            <p className="rb-help" id="rb-tile-help">Enter adds it at the end. Space picks it up to place with the arrow keys.</p>
          </div>}
        </aside>
      </div>
    </div>
    {drag && !drag.keys && DragIcon && <div ref={ghost} className="rb-ghost" aria-hidden="true"><DragIcon aria-hidden="true" /><b>{sourceLabel(drag.source)}</b></div>}
    {blockOf && <SaveTemplate engagement={ctx.id} name={blockOf.name} count={blockOf.ids.length} sessions={blockOf.ids} onClose={saved => { setBlockOf(null); if (saved) { setError(false); setMessage(saved); setBlocks(null); } }} />}
    {saveTemplate && <SaveTemplate engagement={ctx.id} name={ctx.title} count={count} onClose={saved => { setSaveTemplate(false); if (saved) { setError(false); setMessage(saved); } }} />}
  </main>;
}

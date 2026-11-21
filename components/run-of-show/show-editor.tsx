"use client";
import { ShellNav, type ShellEngagement } from "@/components/layout/shell-nav";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Menu } from "@/components/ui/menu";
import { StepChip } from "@/components/ui/chips";
import type { TvAppearance } from "@/lib/tv/types";
import { StepPreview } from "./step-preview";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { AlignLeft, BookOpen, ChevronDown, CircleCheck, Cloud, Coins, Columns4, Copy, EyeOff, Gauge, GripVertical, Grid2x2, HandHeart, House, Image as ImageIcon, LayoutTemplate,
  Check, CheckCheck, Layers, List, ListChecks, ListOrdered, Lock, MessageCircleQuestion, MessageSquareQuote, Monitor, MoreHorizontal, Newspaper, PencilLine, PenLine, Plus, Printer, Radio, RefreshCw, Repeat, ScanLine, Search, Trash2, type LucideProps } from "lucide-react";
import { parts, type Part, type RunOfShow, type ShowSession } from "@/lib/run-of-show/types";
import { SessionForm, initialDraft, sessionInput, type FormDraft } from "./session-form";
import { SaveTemplate } from "./save-template";
import { AddImages, type ImageTarget } from "./add-images";
import type { EngagementImage } from "@/lib/images/shared";
import { loopOf } from "@/lib/images/loop";
import { stepTimer, timerMarks } from "@/lib/live/timer";
import { sortSessions } from "@/lib/run-of-show/policy";
import { Timer as TimerIcon } from "lucide-react";
import { visibilityOf, withVisibility } from "@/lib/interactions/visibility";
import { PrivateTag } from "@/components/interactions/private-tag";
import { contentLabels, contentOf, fallbackKinds, type ContentScreen, type InteractionKind, type KindInfo } from "@/lib/interactions/kinds";
import { canSelfPace, clock, droppedSession, endOfRun, hasSections, liveMinutes, onlyMoved, palette, partOf, partTimes, placeSession, sectionAt, sectionName, sectionsOf, slots, stepSlot, type PaletteEntry, type Section, type Slot } from "@/lib/run-of-show/builder";
import type { Template } from "@/lib/templates/types";
import { reducedMotion, tokenMs } from "@/lib/tv/board";
import { springRate, springStep } from "@/lib/tv/motion";
import "./builder.css";

type Icon = ComponentType<LucideProps>;
const kindIcons: Partial<Record<InteractionKind, Icon>> = { word_cloud: Cloud, wall: AlignLeft, qa: MessageCircleQuestion, choice: ListChecks, scale: Gauge, ranking: ListOrdered,
  points: Coins, grid: Grid2x2, form: Lock, sign: PenLine, statements: MessageSquareQuote, content: Monitor, bullets: List, confirm: CheckCheck, four_lists: Columns4 };
// An image loop's row says whether it is Home and how it runs (LP-1).
function loopChips(s: ShowSession, home: string | null | undefined) {
  if (s.interaction !== "content" || contentOf(s.options).screen !== "loop") return null;
  const loop = loopOf(s.options);
  return <>{home === s.id && <span className="rb-chip is-info"><House aria-hidden="true" />Home screen</span>}
    <span className="rb-chip is-info"><Repeat aria-hidden="true" />{loop ? `${loop.images.length} ${loop.images.length === 1 ? "image" : "images"} · ${loop.seconds}s` : "No images yet"}</span></>;
}
const screenIcons: Record<ContentScreen, Icon> = { scripture: BookOpen, headline: Newspaper, prayer: HandHeart, image: ImageIcon, holding: Monitor, screen_check: ScanLine, loop: Repeat };
const iconOf = (kind: InteractionKind, screen?: ContentScreen | null) => kind === "content" && screen ? screenIcons[screen] : kindIcons[kind] ?? Monitor;


const messages: Record<string, string> = {
  conflict: "Someone changed this session or its order. Your edits are still here. Reload the run of show before editing again.",
  running: "This session is running or already has answers. Keep its mode and interaction, or choose Home under the live screen before removing it.",
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
function SectionHead({ name, line, locked, collapsed, onCollapse, onRename, onBlock }: {
  name: string; line: string; locked: boolean; collapsed: boolean;
  onCollapse: () => void; onRename: (name: string) => void; onBlock: () => void;
}) {
  const [value, setValue] = useState(name), menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => setValue(name), [name]);
  const commit = () => { const next = value.replace(/\s+/g, " ").trim(); if (next !== name) onRename(next); else setValue(name); };
  const act = (run: () => void) => { if (menu.current) menu.current.open = false; run(); };
  return <div className="rb-sec-head">
    <button type="button" className="rb-section-toggle" aria-expanded={!collapsed} aria-label={`${collapsed ? "Expand" : "Collapse"} ${name || "unnamed section"}`} onClick={onCollapse}><ChevronDown size={12} aria-hidden="true" /></button>
    <input aria-label="Section name" placeholder="Name this section" maxLength={100} value={value} disabled={locked} onChange={e => setValue(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } else if (e.key === "Escape") setValue(name); }} />
    <span className="show-muted">{line}</span>
    <details className="rb-sec-menu" ref={menu}><summary aria-label={`More actions for ${name || "this section"}`}><MoreHorizontal size={18} aria-hidden="true" /></summary>
      <div><button type="button" disabled={locked} onClick={() => act(onBlock)}>Save as a block</button>
        {name && <button type="button" disabled={locked} onClick={() => act(() => onRename(""))}>Remove the section name</button>}</div></details>
  </div>;
}

// What Delete does to a step, said before it happens. A step on the TV or still answering is stopped first (admins only).
function deleteNote(step: ShowSession) {
  if (["live", "phones_down"].includes(step.state)) return `${step.title} is on the TV now. Deleting it stops its answers, puts Home on the TV and takes it out of the run of show.`;
  if (step.state === "open") return `${step.title} is still taking answers. Deleting it stops them and takes it out of the run of show.`;
  return `${step.title} will leave the run of show.`;
}

export function ShowEditor({ initial, notice = "", fourLists = true, shell = null, display, renderTime, admin = false }: {
  initial: RunOfShow; notice?: string; fourLists?: boolean; shell?: ShellEngagement | null; display?: TvAppearance; renderTime: string;
  // An admin can always delete a step (November 20): the database stops an open step's answers, and takes the live step off the TV, first.
  admin?: boolean;
}) {
  const [show, setShow] = useState(initial), [pending, setPending] = useState<Op[]>([]);
  const [message, setMessage] = useState(notice), [error, setError] = useState(false), [reloadNeeded, setReloadNeeded] = useState(false), [announce, setAnnounce] = useState("");
  const [openId, setOpen] = useState<string | null>(() => sortSessions(initial.sessions)[0]?.id ?? null);
  const [tab, setTab] = useState("content");
  const [lookup, setLookup] = useState(""), [addQuery, setAddQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false), [dropMode, setDropMode] = useState<"live" | "self_paced">("live");
  const [collapsed, setCollapsed] = useState(new Set<string>()), [deleting, setDeleting] = useState<ShowSession | null>(null);
  const [movingSection, setMovingSection] = useState(false), [sectionChoice, setSectionChoice] = useState("");
  const [drafts, setDrafts] = useState(new Map<string, FormDraft>()), [retrying, setRetrying] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null), [saveTemplate, setSaveTemplate] = useState(false), [addingImages, setAddingImages] = useState(false);
  const [pendingSection, setPendingSection] = useState<{ part: Part; name: string } | null>(null), [adding, setAdding] = useState<{ part: Part; name: string } | null>(null);
  const [blockOf, setBlockOf] = useState<{ name: string; ids: string[] } | null>(null);
  const [blocks, setBlocks] = useState<Template[] | null>(null), [blockBusy, setBlockBusy] = useState<string | null>(null);
  const [deletingBlock, setDeletingBlock] = useState<Template | null>(null);
  const latest = useRef(show), queue = useRef(Promise.resolve()), draftRef = useRef(new Map<string, FormDraft>());
  const bases = useRef(new Map<string, ShowSession>()), timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const dragRef = useRef(drag), ghost = useRef<HTMLDivElement>(null), runRef = useRef<HTMLDivElement>(null);
  const stepsScroll = useRef<HTMLDivElement>(null), addAnchor = useRef<HTMLButtonElement>(null), addMenu = useRef<HTMLDivElement>(null), addField = useRef<HTMLInputElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  dragRef.current = drag;
  const ctx = show.context, base = `/admin/${ctx.id}`, endpoint = `/api/run-of-show/${ctx.id}`;
  const workshop = shell?.type === "team_workshop";
  const [home, setHome] = useState(ctx.home_session ?? null);
  useEffect(() => { const on = (event: Event) => setHome((event as CustomEvent<string | null>).detail); window.addEventListener("cwl:home", on); return () => window.removeEventListener("cwl:home", on); }, []);
  const kinds: KindInfo[] = ctx.kinds?.length ? ctx.kinds : Object.values(fallbackKinds);
  const tiles = useMemo(() => palette(kinds), [kinds]);
  const sessions = useMemo(() => pending.reduce((list, op) => op.apply(list), show.sessions), [pending, show.sessions]);
  // Timers that run through later steps (D21): a blue edge on each step they span, with a chip.
  const marks = useMemo(() => timerMarks(sortSessions(sessions).filter(x => x.mode === "live")), [sessions]);
  const locked = ctx.closed || reloadNeeded;
  const visibleParts = workshop ? parts.filter(part => part === "Day 1" || sessions.some(step => step.part === part)) : parts;
  const selected = sessions.find(step => step.id === openId);
  const saving = pending.length > 0 || blockBusy !== null || drafts.size > 0 && !error;
  const hasDrafts = drafts.size > 0;
  const dirty = saving || hasDrafts;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    const scheduled = timers.current;
    return () => { for (const timer of scheduled.values()) clearTimeout(timer); };
  }, []);

  async function load() {
    const response = await fetch(endpoint, { cache: "no-store" }); if (!response.ok) throw new Error("load");
    return await response.json() as RunOfShow;
  }
  // Every change goes to the server one at a time, in order. What is on screen is the
  // server's run of show with the changes still on their way applied on top, so a drop
  // lands at once and nothing jumps when the server answers.
  function enqueue(apply: Op["apply"], request: (current: RunOfShow) => { action: string; input: unknown } | null, after?: (ok: boolean, transient: boolean) => void) {
    const op: Op = { key: crypto.randomUUID(), apply };
    setPending(list => [...list, op]);
    queue.current = queue.current.then(async () => {
      let ok = false, transient = false;
      try {
        const body = request(latest.current);
        if (!body) ok = true;
        else {
          const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          const result = await response.json().catch(() => ({}));
          ok = response.ok && result.status === "ok";
          transient = response.status >= 500;
          if (!ok) { setError(true); setMessage(result.message || messages[result.status] || "Check the session details and try again."); }
        }
      } catch { transient = true; setError(true); setMessage(messages.unavailable); }
      try { const next = await load(); latest.current = next; setShow(next); }
      catch { setReloadNeeded(true); setError(true); setMessage("Saved. Reload the run of show to see your changes."); }
      setPending(list => list.filter(x => x.key !== op.key));
      after?.(ok, transient);
    });
  }
  async function reload() {
    try {
      const next = await load();
      latest.current = next; setShow(next); setReloadNeeded(false); setError(false);
      bases.current.clear();
      setMessage(hasDrafts ? "Run of show reloaded. Edit a field to save your changes against the latest version." : "Run of show reloaded.");
    } catch { setError(true); setMessage("We couldn’t load the run of show. Please try again."); }
  }

  function openOptions(id: string | null) {
    setOpen(id);
    setTab("content");
  }

  function keepDraft(id: string, form: FormDraft) {
    draftRef.current.set(id, form);
    setDrafts(new Map(draftRef.current));
  }

  function forget(id: string) {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    draftRef.current.delete(id);
    bases.current.delete(id);
    setDrafts(new Map(draftRef.current));
  }

  function submitDraft(id: string, form: FormDraft, intent?: "ready" | "draft", attempt = 0) {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    let input;
    try { input = sessionInput(form, ctx.timezone, intent ?? form.value.state); }
    catch (error) { setError(true); setMessage(error instanceof Error ? error.message : messages.unavailable); return; }
    if (!input.title.trim() || !Number.isInteger(input.planned_minutes) || input.planned_minutes < 1) {
      setError(true); setMessage("Enter a title and length for this step."); return;
    }
    const { section, ...withoutSection } = input;
    const sectionEdited = section !== undefined && section !== sectionName(bases.current.get(id) ?? latest.current.sessions.find(step => step.id === id) ?? form.value);
    enqueue(list => list.map(step => step.id === id ? { ...step, ...(sectionEdited ? input : withoutSection), revision: step.revision } : step),
      current => {
        const server = current.sessions.find(step => step.id === id);
        if (!server) return null;
        const basis = bases.current.get(id);
        const expected = basis && !onlyMoved(basis, server) ? basis.revision : server.revision;
        // Live state is managed in the live room. An edit here retains whatever state the server holds.
        if (!intent && basis && visibilityOf(basis) !== visibilityOf(input)) {
          const normalizedBasis = sessionInput(initialDraft(basis, ctx.timezone), ctx.timezone, basis.state);
          const withoutVisibility = (step: typeof input) => ({ ...step, options: withVisibility(step.options, "public") });
          if (JSON.stringify(withoutVisibility(input)) === JSON.stringify(withoutVisibility(normalizedBasis))) {
            return { action: "visibility", input: { session: id, visibility: visibilityOf(input) } };
          }
        }
        const state = intent && ["draft", "ready"].includes(server.state) ? input.state : server.state;
        return { action: "save", input: { ...(sectionEdited ? input : withoutSection), state, revision: expected } };
      },
      (ok, transient) => {
        if (ok) {
          const saved = latest.current.sessions.find(step => step.id === id);
          if (draftRef.current.get(id) === form) forget(id);
          else if (saved) bases.current.set(id, saved);
          setError(false); setRetrying(false); setMessage("");
        } else if (transient && attempt === 0 && draftRef.current.get(id) === form) {
          setRetrying(true);
          timers.current.set(id, setTimeout(() => submitDraft(id, form, intent, 1), 1200));
        } else setRetrying(false);
      });
  }

  function updateDraft(id: string, form: FormDraft) {
    if (!bases.current.has(id)) {
      const stored = latest.current.sessions.find(step => step.id === id);
      if (stored) bases.current.set(id, stored);
    }
    keepDraft(id, form);
    clearTimeout(timers.current.get(id));
    setError(false); setRetrying(false);
    timers.current.set(id, setTimeout(() => submitDraft(id, form), 600));
  }

  function flushDrafts() {
    for (const [id, form] of draftRef.current) {
      if (timers.current.has(id)) submitDraft(id, form);
    }
    return queue.current;
  }

  // ---------- Changes ----------
  function insert(entry: PaletteEntry, slot: Slot) {
    const section = slot.section ?? sectionAt(sessions, slot.part, slot.index);
    const s = { ...droppedSession(entry, ctx.id, slot.part, kinds, crypto.randomUUID(), dropMode), section };
    if (pendingSection && pendingSection.part === slot.part && pendingSection.name === section) setPendingSection(null);
    enqueue(list => placeSession(list, s, slot.part, slot.index), () => ({ action: "save", input: { ...s, revision: null, index: slot.index } }),
      ok => { if (!ok) { forget(s.id); setOpen(current => current === s.id ? null : current); } });
    setAddOpen(false);
    openOptions(s.id);
    setAnnounce(`${entry.label} added to ${section || slot.part}, position ${slot.index + 1}. Its options are open.`);
  }
  // Images as slides (TC-2): one Image step per image, in order, at the end of the chosen section. Each title stays "Image 1",
  // "Image 2" and so on, shown greyed until the facilitator types one; nothing is blocked.
  function addImages(images: EngagementImage[], target: ImageTarget) {
    const entry = tiles.screens.find(e => e.screen === "image");
    if (!entry || !images.length) return;
    const taken = sessions.filter(x => x.interaction === "content" && contentOf(x.options).screen === "image").length;
    images.forEach((image, i) => {
      const s: ShowSession = { ...droppedSession(entry, ctx.id, target.part, kinds, crypto.randomUUID(), "live"), section: target.section, title: `Image ${taken + i + 1}`, state: "ready",
        options: { screen: "image", image: { id: image.id, display: "fill" }, untitled: true } };
      const at = (list: ShowSession[]) => { const group = partOf(list, target.part); let last = -1; group.forEach((x, k) => { if (sectionName(x) === target.section) last = k; }); return last >= 0 ? last + 1 : group.length; };
      enqueue(list => placeSession(list, s, target.part, at(list)), current => ({ action: "save", input: { ...s, revision: null, index: at(current.sessions) } }));
    });
    setAddingImages(false); setError(false);
    setMessage(`${images.length} ${images.length === 1 ? "slide" : "slides"} added to ${target.section || target.part}. Type a title for each in its options.`);
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
  const endSlot = (): Slot => pendingSection
    ? { part: pendingSection.part, index: partOf(sessions, pendingSection.part).length, section: pendingSection.name }
    : selected ? { part: selected.part, index: partOf(sessions, selected.part).findIndex(step => step.id === selected.id) + 1, section: sectionName(selected) }
      : endOfRun(sessions);
  async function loadBlocks() {
    try { const response = await fetch("/api/templates", { cache: "no-store" }), data = await response.json() as { templates?: Template[] }; setBlocks(response.ok ? (data.templates ?? []).filter(t => t.block) : []); }
    catch { setBlocks([]); }
  }
  // A saved block adds its sessions at the end of the part it was saved from, after every change still on its way.
  function addBlock(t: Template) {
    setBlockBusy(t.id);
    setAddOpen(false);
    const destination = endSlot();
    queue.current = flushDrafts().then(async () => {
      try {
        const existing = new Set(latest.current.sessions.map(step => step.id));
        const response = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply", input: { template: t.id, engagement: ctx.id } }) });
        const result = await response.json().catch(() => ({}));
        if (response.ok && result.status === "ok") { setError(false); setMessage(`${t.name} added: ${result.count} ${result.count === 1 ? "step" : "steps"}.`); }
        else { setError(true); setMessage(result.message || "We couldn’t add that block. Please try again."); }
        let next = await load();
        if (response.ok && result.status === "ok") {
          const added = sortSessions(next.sessions.filter(step => !existing.has(step.id)));
          const complete = added.length === result.count && next.sessions.filter(step => existing.has(step.id)).length === existing.size;
          if (!complete) { setError(true); setMessage("The block was added. Reload the run before moving its steps."); }
          if (complete && added[0]) openOptions(added[0].id);
          for (const [index, step] of (complete ? added : []).entries()) {
            const current = next.sessions.find(item => item.id === step.id);
            if (!current) continue;
            const placed = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "place", input: { id: current.id, revision: current.revision, part: destination.part,
                index: destination.index + index, section: pendingSection?.name ?? (sectionName(current) || destination.section) } }) });
            if (!placed.ok) { setError(true); setMessage("The block was added. Move its steps to the right section."); break; }
            next = await load();
          }
          if (pendingSection) setPendingSection(null);
        }
        latest.current = next; setShow(next);
      } catch { setError(true); setMessage(messages.unavailable); }
      setBlockBusy(null);
    });
  }
  async function removeBlock(t: Template) {
    setDeletingBlock(null);
    try {
      const response = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove", input: { template: t.id } }) });
      if (!response.ok) throw new Error("remove");
      setBlocks(list => list?.filter(x => x.id !== t.id) ?? null); setError(false); setMessage(`${t.name} removed.`);
    } catch { setError(true); setMessage("We couldn’t remove that block. Please try again."); }
  }
  function remove(session: ShowSession) {
    setOpen(current => current === session.id ? null : current); forget(session.id);
    enqueue(list => list.filter(s => s.id !== session.id), current => { const cur = current.sessions.find(x => x.id === session.id); return cur ? { action: "remove", input: { id: cur.id, revision: cur.revision } } : null; },
      ok => { if (ok) { setError(false); setMessage("Session removed."); } });
  }
  function duplicate(step: ShowSession) {
    const local = draftRef.current.get(step.id)?.value ?? step;
    const copy = { ...local, id: crypto.randomUUID(), title: `${local.title.slice(0, 193)} (copy)`, state: "draft", planned_start: null, shown_at: null, closed_at: null, revision: 0 };
    const index = partOf(sessions, step.part).findIndex(item => item.id === step.id) + 1;
    enqueue(list => placeSession(list, copy, step.part, index), () => ({ action: "save", input: { ...copy, index, revision: null } }),
      ok => { if (!ok) setOpen(current => current === copy.id ? step.id : current); });
    openOptions(copy.id);
  }

  function teamLed(step: ShowSession, value: boolean) {
    queue.current = flushDrafts().then(async () => {
      try {
        const response = await fetch(`${endpoint}/team-led`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session: step.id, value }) });
        if (!response.ok) throw new Error("save");
        const next = await load(); latest.current = next; setShow(next);
        setMessage(value ? "The scribe console will be off for this step." : "The scribe console will be on for this step.");
      } catch { setError(true); setMessage(messages.unavailable); }
    });
  }

  // ---------- Dragging, by pointer or keyboard ----------
  const findGap = useCallback((x: number, y: number, source: Source): Slot | null => {
    const run = runRef.current; if (!run) return null;
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
    const rows = [...best.querySelectorAll<HTMLElement>("[data-row]")].filter(el => !el.hidden && el.dataset.row !== moving);
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
    const order = [...best.querySelectorAll<HTMLElement>("[data-row]")].filter(el => el.dataset.row !== moving);
    return { part, index: below ? order.indexOf(below) : above ? order.indexOf(above) + 1 : order.length, section };
  }, []);
  function begin(source: Source, keys: boolean, gap: Slot | null = null) {
    setAddOpen(false);
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
      const scroller = stepsScroll.current, bounds = scroller?.getBoundingClientRect();
      if (bounds && ev.clientX >= bounds.left && ev.clientX <= bounds.right) {
        if (ev.clientY < bounds.top + 36) scroller?.scrollBy(0, -14);
        else if (ev.clientY > bounds.bottom - 36) scroller?.scrollBy(0, 14);
      }
    };
    const stop = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", cancel); document.removeEventListener("keydown", key); pointer.current = null; };
    const up = () => { stop(); if (!started) { if (source.type === "tile") insert(source.entry, endSlot()); return; } finish(true); };
    const cancel = () => { stop(); if (started) finish(false); };
    const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.preventDefault(); cancel(); } };
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up); document.addEventListener("pointercancel", cancel); document.addEventListener("keydown", key);
  }
  // The dragged tile follows the pointer (moved directly, not by rendering).
  useLayoutEffect(() => { const p = pointer.current; if (ghost.current && p) ghost.current.style.transform = `translate(${p.x + 14}px, ${p.y + 14}px)`; }, [drag?.source]);
  // The keyboard's pick up, move and drop.
  useEffect(() => {
    if (!drag?.keys) return;
    const moving = drag.source.type === "row" ? drag.source.session.id : undefined;
    const all = slots(sessions, moving).filter(slot => visibleParts.includes(slot.part));
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
    else if (e.key === " ") { e.preventDefault(); begin({ type: "tile", entry }, true, endSlot()); }
  }
  function gripKey(e: ReactKeyboardEvent, s: ShowSession) {
    if (locked || dragRef.current || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault(); e.stopPropagation();
    begin({ type: "row", session: s }, true, { part: s.part, index: partOf(sessions, s.part).findIndex(x => x.id === s.id) });
  }

  // ---------- Drawing ----------
  const moving = drag?.source.type === "row" ? drag.source.session.id : null;
  const glideKey = parts.map(part => `${part}:${partOf(sessions, part).map(step => `${step.id}~${sectionName(step)}`).join(",")}`).join("|")
    + (drag?.gap ? `#${drag.gap.part}:${drag.gap.index}:${drag.gap.section ?? ""}` : "")
    + [...collapsed].join(",") + lookup;
  useGlide(runRef, glideKey);
  useEffect(() => { if (addOpen && blocks === null) void loadBlocks(); }, [addOpen, blocks]);
  useLayoutEffect(() => {
    if (!addOpen || !addMenu.current) return;
    const menu = addMenu.current, anchor = addAnchor.current;
    menu.showPopover();
    function position() {
      const at = anchor?.getBoundingClientRect();
      const left = Math.max(8, Math.min(at?.left ?? 8, window.innerWidth - menu.offsetWidth - 8));
      const top = (at?.bottom ?? 8) + 8;
      menu.style.top = `${top}px`;
      menu.style.left = `${left}px`;
      menu.style.maxHeight = `${Math.max(150, window.innerHeight - top - 8)}px`;
    }
    position();
    addField.current?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.contains(event.target) && !anchor?.contains(event.target)) setAddOpen(false);
    };
    window.addEventListener("resize", position);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("resize", position);
      document.removeEventListener("pointerdown", outside);
      if (menu.matches(":popover-open")) menu.hidePopover();
    };
  }, [addOpen]);

  const tz = ctx.timezone;
  const hour = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour: "numeric", minute: "2-digit", hourCycle: "h23" }), [tz]);
  const zoneName = new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "longGeneric" })
    .formatToParts(new Date(renderTime)).find(part => part.type === "timeZoneName")?.value ?? tz;
  const kindLabel = (step: ShowSession) => step.interaction === "content" ? contentLabels[contentOf(step.options).screen]
    : kinds.find(kind => kind.kind === step.interaction)?.label ?? fallbackKinds[step.interaction]?.label ?? step.interaction;
  const total = liveMinutes(sessions), count = sessions.length, empty = count === 0;
  const duration = total < 60 ? `${total} min` : `${Math.floor(total / 60)} h${total % 60 ? ` ${total % 60} min` : ""}`;
  const chosen = selected ? drafts.get(selected.id)?.value ?? selected : undefined;
  const Kind = chosen && iconOf(chosen.interaction, contentOf(chosen.options).screen);
  const previewDisplay = display ?? { church: ctx.church, title: ctx.title, room_code: "ABCDEF12", logo_url: null, theme: "dark", texture: true, room_size: "very_small", reduced_motion: true };
  const chosenTimes = selected ? partTimes(partOf(sessions, selected.part)) : null;
  const chosenTime = selected && chosenTimes?.get(selected.id);
  const chosenFirst = selected && partOf(sessions, selected.part).find(step => step.mode === "live")?.id === selected.id;
  const existingSections = selected ? [...new Set(partOf(sessions, selected.part).map(sectionName).filter(Boolean))] : [];
  const query = lookup.trim().toLowerCase(), menuQuery = addQuery.trim().toLowerCase();
  const questionKinds = ["word_cloud", "wall", "choice", "scale", "ranking", "points", "grid", "qa"];
  const layoutGroups = [
    { title: "Show", entries: tiles.screens.filter(entry => ["headline", "image", "loop", "holding"].includes(entry.screen ?? "")).map(entry => ({ ...entry, label: entry.screen === "headline" ? "Content screen" : entry.screen === "image" ? "Image slide" : entry.screen === "holding" ? "Holding screen" : entry.label })) },
    { title: "Ask the room", entries: tiles.interactions.filter(entry => questionKinds.includes(entry.kind)) },
    { title: "Commit", entries: tiles.interactions.filter(entry => entry.kind === "sign" || entry.kind === "form") },
    ...(!workshop ? [{ title: "Wayfinding", entries: tiles.interactions.filter(entry => ![...questionKinds, "sign", "form"].includes(entry.kind) && (entry.kind !== "four_lists" || fourLists)) }] : []),
  ];
  const visibleGroups = layoutGroups.map(group => ({
    ...group, entries: group.entries.filter(item => `${item.label} ${item.blurb}`.toLowerCase().includes(menuQuery)),
  })).filter(group => group.entries.length);
  const filteredBlocks = (blocks ?? []).filter(item => item.name.toLowerCase().includes(menuQuery));
  const slotEl = (part: Part) => {
    if (!drag?.gap || drag.gap.part !== part) return null;
    const SlotIcon = drag.source.type === "tile" ? iconOf(drag.source.entry.kind, drag.source.entry.screen) : iconOf(drag.source.session.interaction, contentOf(drag.source.session.options).screen);
    return <li key="slot" className="rb-slot" data-glide="slot" aria-hidden="true"><span><SlotIcon aria-hidden="true" />Drop {sourceLabel(drag.source)} here</span></li>;
  };
  const DragIcon = drag ? drag.source.type === "tile" ? iconOf(drag.source.entry.kind, drag.source.entry.screen) : iconOf(drag.source.session.interaction, contentOf(drag.source.session.options).screen) : null;
  const toggleCollapsed = (section: string) => setCollapsed(previous => {
    const next = new Set(previous);
    if (next.has(section)) next.delete(section); else next.add(section);
    return next;
  });
  const closeAdd = () => { setAddOpen(false); addAnchor.current?.focus(); };
  function showAdd() { setAddQuery(""); setAddOpen(true); }

  return <main id="main" className="show-app rb-workspace">
    <ShellNav engagement={shell ?? { id: ctx.id, title: ctx.title, church: ctx.church, type: "wayfinding" }} fourLists={sessions.some(step => step.interaction === "four_lists")} />
    <div className="show-workspace">
      <div className="show-private"><EyeOff size={15} aria-hidden="true" />Only you see this</div>
      <header className="show-header rb-header">
        <div className="rb-header-title"><p className="show-eyebrow">{ctx.church} · {ctx.title}</p><div><h1>Run of show</h1>
          <span className="rb-chip rb-total">{count} {count === 1 ? "step" : "steps"} · {duration}</span></div></div>
        <div className="show-actions rb-header-actions">
          <span className={`rb-save-state${error ? " is-error" : ""}`} role="status">
            {error ? retrying ? "Couldn't save. Retrying." : "Couldn't save." : saving ? "Saving…" : <><Check size={14} aria-hidden="true" />All changes saved</>}
          </span>
          <Button disabled={locked || !tiles.screens.some(entry => entry.screen === "image")} onClick={() => setAddingImages(true)}><ImageIcon />Add slides from images</Button>
          <Menu label="More run of show actions" className="rb-header-more" trigger={<>More<ChevronDown size={14} aria-hidden="true" /></>} items={[
            { label: "Save as template", icon: <Copy size={16} aria-hidden="true" />, onSelect: () => void flushDrafts().then(() => setSaveTemplate(true)), disabled: empty || locked },
            { label: "Use a template", icon: <LayoutTemplate size={16} aria-hidden="true" />, href: `/admin/templates?engagement=${ctx.id}` },
            { label: "Print run of show", icon: <Printer size={16} aria-hidden="true" />, onSelect: () => {
              const print = window.open("about:blank", "_blank");
              if (print) { print.opener = null; void flushDrafts().then(() => print.location.replace(`${base}/run-of-show/print`)); }
              else void flushDrafts().then(() => location.assign(`${base}/run-of-show/print`));
            } },
            { label: "Reload", icon: <RefreshCw size={16} aria-hidden="true" />, onSelect: () => void flushDrafts().then(reload) },
            { label: `Times in ${zoneName}`, disabled: true, dividerBefore: true },
          ]} />
          <Button variant="primary" href={`/control/${ctx.id}`} onClick={event => {
            if (!dirty || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            void flushDrafts().then(() => { if (!draftRef.current.size) location.assign(`/control/${ctx.id}`); });
          }}><Radio />Open the live room</Button>
        </div>
      </header>
      {message && <div className={`show-message${error ? " is-error" : ""}`} role={error ? "alert" : "status"}>{message}</div>}
      {ctx.closed && <p className="show-message">This engagement has closed. You can read and print its run of show.</p>}
      <p className="sr-only" aria-live="assertive">{announce}</p>
      <p className="sr-only" id="rb-move-help">Press Space or Enter to pick it up, then the up and down arrows to move it.</p>
      <div className="rb-body">
        <section className="rb-steps" aria-label="Steps">
          <div className="rb-steps-tools">
            <label className="rb-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Find a step" placeholder="Find a step" value={lookup} onChange={event => setLookup(event.target.value)} /></label>
            <Button ref={addAnchor} variant="primary" size="small" aria-expanded={addOpen} disabled={locked} onClick={() => addOpen ? closeAdd() : showAdd()}><Plus />Add step</Button>
          </div>
          <div className="rb-steps-scroll" ref={stepsScroll}>
            <div className="rb-run" ref={runRef}>
              {visibleParts.map(part => {
                const group = partOf(sessions, part), times = partTimes(group), target = drag?.gap?.part === part;
                const pending = pendingSection?.part === part ? pendingSection.name : null, named = hasSections(group) || pending !== null;
                const gapSection = target ? drag!.gap!.section ?? sectionAt(sessions, part, drag!.gap!.index, moving ?? undefined) : null;
                let shown = 0;
                const rows = sectionsOf(group).flatMap(sec => {
                  let headed = !named;
                  const folded = collapsed.has(sec.key);
                  const at = times.get(sec.sessions[0].id);
                  const line = `${at?.at ? hour.format(new Date(at.at)) : clock(at?.offset ?? 0)} · ${liveMinutes(sec.sessions)} min`;
                  const head = () => {
                    if (headed) return [];
                    headed = true;
                    return [<li key={`sec:${sec.key}`} className="rb-sec" data-glide={`s:${sec.key}`} data-sec-head="" data-sec-name={sec.name}>
                      <SectionHead name={sec.name} line={line} locked={locked} collapsed={folded} onCollapse={() => toggleCollapsed(sec.key)}
                        onRename={name => renameSection(sec, name)} onBlock={() => setBlockOf({ name: sec.name || ctx.title, ids: sec.sessions.map(step => step.id) })} />
                    </li>];
                  };
                  return sec.sessions.flatMap(step => {
                    const out = [];
                    if (step.id !== moving) {
                      if (target && drag!.gap!.index === shown) {
                        if (!headed && gapSection !== sec.name) out.push(slotEl(part), ...head());
                        else out.push(...head(), slotEl(part));
                      }
                      shown++;
                    }
                    out.push(...head());
                    const current = drafts.get(step.id)?.value ?? step;
                    const picked = step.id === openId, t = times.get(step.id), Icon = iconOf(current.interaction, contentOf(current.options).screen);
                    const time = step.mode === "self_paced" ? "Self-paced" : t?.at ? hour.format(new Date(t.at)) : clock(t?.offset ?? 0);
                    const State = step.state === "draft" ? PencilLine : CircleCheck, design = step.state === "draft" ? "Draft" : "Ready";
                    const mark = marks.get(step.id), hidden = folded || !`${current.title} ${kindLabel(current)} ${sec.name}`.toLowerCase().includes(query);
                    out.push(<li key={step.id} hidden={hidden} data-row={step.id} data-sec={sec.name} data-glide={!hidden ? step.id : undefined}
                      className={`rb-row${picked ? " is-open" : ""}${step.id === moving ? " is-moving" : ""}${sec.name ? " is-sectioned" : ""}${mark && (mark.role !== "owner" || stepTimer(step.options)?.through) ? " has-timer-span" : ""}`}>
                      <div className="rb-head">
                        <button type="button" className="rb-grip" aria-label={`Move ${step.title}`} aria-describedby="rb-move-help" disabled={locked}
                          onPointerDown={event => pointerStart(event, { type: "row", session: step })} onKeyDown={event => gripKey(event, step)}><GripVertical size={14} aria-hidden="true" /></button>
                        <button type="button" className="rb-tog" aria-pressed={picked} aria-label={`Open options for ${current.title || "untitled step"}`} onClick={() => { if (!dragRef.current) openOptions(step.id); }}>
                          <span className="rb-time" title={time}>{step.mode === "self_paced" ? "Self" : time}</span>
                          <span className="rb-ic"><Icon size={16} aria-hidden="true" /></span>
                          <span className="rb-name"><strong className={current.options?.untitled ? "is-untitled" : undefined}>{current.title || "Untitled step"}</strong>
                            {step.mode === "self_paced" && <span className="sr-only">Self-paced</span>}</span>
                          <PrivateTag step={current} />
                          <span className={`rb-design is-${design.toLowerCase()}`} role="img" aria-label={design} title={design}><State size={16} aria-hidden="true" /></span>
                        </button>
                        {loopChips(step, home)}
                        {mark && <span className="rb-chip is-info rb-timer-mark" data-timer-mark={mark.role} title={mark.label}><TimerIcon aria-hidden="true" /><span className="sr-only">{mark.label}</span></span>}
                      </div>
                    </li>);
                    return out;
                  });
                });
                const pendingHead = pending !== null ? <li key="sec:pending" className="rb-sec is-pending" data-glide={`s:pending:${part}`} data-sec-head="" data-sec-name={pending}>
                  <div className="rb-sec-head"><strong>{pending}</strong><Button size="small" variant="quiet" onClick={showAdd}>Add step</Button>
                    <Button size="small" variant="quiet" onClick={() => setPendingSection(null)}>Cancel</Button></div></li> : null;
                if (target && drag!.gap!.index >= shown) {
                  if (pendingHead && gapSection === pending) rows.push(pendingHead, slotEl(part));
                  else rows.push(slotEl(part), pendingHead);
                } else if (pendingHead) rows.push(pendingHead);
                return <section key={part} className="rb-part" data-part={part} aria-labelledby={`part-${part}`}>
                  <h2 id={`part-${part}`} data-glide={`h:${part}`}>{part}</h2>
                  <ol className={`rb-list${target ? " is-target" : ""}`} aria-label={part}>
                    {rows}
                    {!group.length && !target && pending === null && empty && part === "Day 1" && <li className="rb-empty">
                      <Link href={`/admin/templates?engagement=${ctx.id}`} className="text-link">Start from a template</Link>
                    </li>}
                  </ol>
                  {!locked && (adding?.part === part
                    ? <form className="rb-sec-add" onSubmit={event => {
                      event.preventDefault();
                      const name = adding.name.replace(/\s+/g, " ").trim();
                      if (name) { setPendingSection({ part, name }); setAdding(null); showAdd(); }
                    }}>
                      <label htmlFor={`sec-new-${part}`}>New section name</label><input id={`sec-new-${part}`} autoFocus maxLength={100} value={adding.name}
                        onChange={event => setAdding({ part, name: event.target.value })} />
                      <Button type="submit" size="small" disabled={!adding.name.trim()}>Add section</Button>
                      <Button size="small" variant="quiet" onClick={() => setAdding(null)}>Cancel</Button>
                    </form>
                    : pending === null && <button type="button" className="rb-sec-new" onClick={() => setAdding({ part, name: "" })}><Plus size={14} aria-hidden="true" />Add a section<span className="sr-only"> to {part}</span></button>)}
                </section>;
              })}
            </div>
          </div>
          {addOpen && <div popover="manual" ref={addMenu} className="rb-add-menu" role="dialog" aria-label="Add a step"
            onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); closeAdd(); } }}>
            <label className="rb-search"><Search size={16} aria-hidden="true" /><input ref={addField} type="search" aria-label="Find a step type, block or template" placeholder="Find a step type, block or template" value={addQuery}
              onChange={event => setAddQuery(event.target.value)} /></label>
            <div className="rb-mode" role="radiogroup" aria-label="Add steps as">
              {([["live", "Live in the room"], ["self_paced", "Self-paced"]] as const).map(([value, label]) => <button type="button" key={value} role="radio"
                aria-checked={dropMode === value} className={dropMode === value ? "is-on" : ""} onClick={() => setDropMode(value)}>{label}</button>)}
            </div>
            {visibleGroups.map(group => <div key={group.title} className="rb-add-group" role="group" aria-label={group.title}>
              <h3>{group.title}</h3><div className="rb-add-items">
                {group.entries.map(entry => { const Icon = iconOf(entry.kind, entry.screen); return <button type="button" key={entry.id} className="rb-tile"
                  disabled={locked || dropMode === "self_paced" && !canSelfPace(entry)} aria-describedby="rb-move-help"
                  onPointerDown={event => pointerStart(event, { type: "tile", entry })} onKeyDown={event => tileKey(event, entry)}
                  onClick={event => { if (event.detail === 0) insert(entry, endSlot()); }}>
                  <Icon size={16} aria-hidden="true" /><strong>{entry.label}</strong>
                </button>; })}
              </div>
            </div>)}
            {filteredBlocks.length > 0 && <div className="rb-add-group" role="group" aria-label="Saved blocks">
              <h3>Saved blocks</h3><div className="rb-add-items" data-testid="saved-blocks">
                {filteredBlocks.map(block => <div key={block.id} className="rb-block"><button type="button" className="rb-tile" disabled={locked || blockBusy !== null}
                  onClick={() => addBlock(block)}><Layers size={16} aria-hidden="true" /><strong>{block.name}</strong></button>
                  {block.can_remove && <Button iconOnly size="small" variant="quiet" aria-label={`Remove ${block.name}`} disabled={blockBusy !== null} onClick={() => setDeletingBlock(block)}><Trash2 /></Button>}</div>)}
              </div>
            </div>}
            <Link href={`/admin/templates?engagement=${ctx.id}`} className="rb-add-template"><LayoutTemplate size={16} aria-hidden="true" />Use a template</Link>
          </div>}
        </section>
        <StepPreview step={chosen} context={ctx} display={previewDisplay} />
        <section className="rb-settings" aria-label="Step settings">
          {selected && chosen && Kind ? <>
            <div className="rb-settings-head"><Kind size={16} aria-hidden="true" /><h2>{kindLabel(chosen)}</h2>
              <StepChip state={selected.state === "draft" ? "draft" : "ready"} compact />
              <Menu className="rb-step-more" label="More step actions" items={[
                { label: "Duplicate", icon: <Copy size={16} aria-hidden="true" />, onSelect: () => duplicate(selected), disabled: locked },
                { label: "Move to section…", onSelect: () => { setSectionChoice(sectionName(selected)); setMovingSection(true); }, disabled: locked },
                { label: "Delete", icon: <Trash2 size={16} aria-hidden="true" />, onSelect: () => setDeleting(selected),
                  disabled: locked || (!admin && ["live", "open", "phones_down"].includes(selected.state)), danger: true },
              ]} />
            </div>
            <SessionForm key={selected.id} session={selected} context={ctx} workshop={workshop} locked={locked} saving={pending.length > 0}
              tab={tab} onTab={setTab} draft={drafts.get(selected.id)} onDraft={form => updateDraft(selected.id, form)} others={sessions} availableParts={visibleParts}
              startNote={selected.mode === "live" && !chosenFirst ? chosenTime?.at ? `Starts at ${hour.format(new Date(chosenTime.at))}, from the lengths before it.` : `Starts ${clock(chosenTime?.offset ?? 0)} into ${selected.part}.` : undefined}
              onDuplicate={() => duplicate(selected)} onReady={(state, form) => {
                if (!bases.current.has(selected.id)) bases.current.set(selected.id, latest.current.sessions.find(step => step.id === selected.id) ?? selected);
                keepDraft(selected.id, form); submitDraft(selected.id, form, state);
              }} onTeamLed={value => teamLed(selected, value)} />
          </> : <p className="rb-preview-empty">Select a step to edit it.</p>}
        </section>
      </div>
    </div>
    <ConfirmDialog open={deleting !== null} title="Delete this step?" description={deleting ? deleteNote(deleting) : ""}
      confirmLabel="Delete step" onCancel={() => setDeleting(null)} onConfirm={() => { if (deleting) remove(deleting); setDeleting(null); }} />
    <ConfirmDialog open={deletingBlock !== null} title="Delete this saved block?" description="Steps already added to a run of show stay there."
      confirmLabel="Delete block" onCancel={() => setDeletingBlock(null)} onConfirm={() => { if (deletingBlock) void removeBlock(deletingBlock); }} />
    {selected && <Dialog open={movingSection} label="Move to a section" className="rb-move-dialog" onClose={() => setMovingSection(false)}>
      <h2>Move to a section</h2>
      <label className="rb-move-section">Section
        <select data-initial-focus value={sectionChoice} onChange={event => setSectionChoice(event.target.value)}><option value="">No section</option>
          {existingSections.map(section => <option value={section} key={section}>{section}</option>)}</select>
      </label>
      <div className="rb-dialog-actions">
        <Button onClick={() => setMovingSection(false)}>Cancel</Button>
        <Button variant="primary" onClick={() => {
          const group = partOf(sessions, selected.part).filter(step => step.id !== selected.id);
          const index = group.reduce((end, step, i) => sectionName(step) === sectionChoice ? i + 1 : end, 0);
          void flushDrafts();
          place(selected, { part: selected.part, index: index || group.length, section: sectionChoice });
          setMovingSection(false);
        }}>Move step</Button>
      </div>
    </Dialog>}
    {drag && !drag.keys && DragIcon && <div ref={ghost} className="rb-ghost" aria-hidden="true"><DragIcon aria-hidden="true" /><b>{sourceLabel(drag.source)}</b></div>}
    {blockOf && <SaveTemplate engagement={ctx.id} name={blockOf.name} count={blockOf.ids.length} sessions={blockOf.ids} onClose={saved => { setBlockOf(null); if (saved) { setError(false); setMessage(saved); setBlocks(null); } }} />}
    {addingImages && <AddImages engagement={ctx.id} sessions={sessions} parts={visibleParts} onAdd={addImages} onClose={() => setAddingImages(false)} />}
    {saveTemplate && <SaveTemplate engagement={ctx.id} name={ctx.title} count={count} onClose={saved => { setSaveTemplate(false); if (saved) { setError(false); setMessage(saved); } }} />}
  </main>;
}

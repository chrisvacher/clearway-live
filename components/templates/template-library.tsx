"use client";
import { ShellNav } from "@/components/layout/shell-nav";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Menu } from "@/components/ui/menu";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { kindLabel } from "@/lib/interactions/kinds";
import { clock } from "@/lib/run-of-show/builder";
import { parts } from "@/lib/run-of-show/types";
import { templateByline } from "@/lib/templates/policy";
import { localTime, zonedInstant } from "@/lib/setup/policy";
import type { Template, TemplateLibrary as Library } from "@/lib/templates/types";
import "@/components/run-of-show/builder.css";
import { Select } from "@/components/ui/select";

// "90 minutes", "2 hours", "2 hours 15 minutes".
export function length(minutes: number) {
  if (minutes < 120) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${h} hours${m ? ` ${m} minutes` : ""}`;
}

// A starting time a day ahead, at 9:00 in the engagement's time zone.
function tomorrowAtNine(timezone: string) {
  const today = localTime(new Date().toISOString(), timezone).slice(0, 10);
  const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1);
  return `${d.toISOString().slice(0, 10)}T09:00`;
}

function templateKind(template: Template) {
  if (template.block) return "Block";
  if (template.engagement_type) return template.engagement_type === "wayfinding" || template.engagement_type === "day_and_a_half" ? "Wayfinding" : "Workshop";
  return template.sessions.some(step => step.part !== "Day 1" || ["lens", "four_lists", "lens_summary"].includes(step.interaction)) ? "Wayfinding" : "Workshop";
}

type LibraryTab = "templates" | "blocks";
const tabFor = (template: Template | undefined | null): LibraryTab => template?.block ? "blocks" : "templates";

export function TemplateLibrary({ initial, admin, engagement, template }: { initial: Library | null; admin: boolean; engagement: string | null; template: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [library, setLibrary] = useState(initial);
  const initialPreview = initial?.templates.find(item => item.id === template) ?? initial?.templates.find(item => item.kind === "shipped") ?? initial?.templates[0];
  const [selected, setSelected] = useState<string | null>(initialPreview?.id ?? null);
  const [tab, setTab] = useState<LibraryTab>(tabFor(initialPreview));
  const [starting, setStarting] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<Template | null>(null);
  const [renaming, setRenaming] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const current = library?.templates.find(item => item.id === selected) ?? null;
  const templates = library?.templates.filter(item => !item.block) ?? [];
  const blocks = library?.templates.filter(item => item.block) ?? [];

  async function manage(action: "remove" | "duplicate" | "rename", item: Template, name?: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/templates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, input: { template: item.id, ...(name ? { name } : {}) } }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.status !== "ok") {
        setMessage(result.message || "We couldn't change that template. Please try again.");
        return;
      }

      setRenaming(null);
      setAsking(null);
      const next = await fetch("/api/templates", { cache: "no-store" }).then(response => response.json()).catch(() => null);
      if (next?.status === "ok") {
        const refreshed = next.templates as Template[];
        setLibrary({ templates: refreshed, engagements: next.engagements, can_manage: next.can_manage === true });
        if (action === "duplicate" || action === "rename") {
          setSelected(result.id);
          setTab(tabFor(item));
        } else if (selected === item.id) {
          setSelected(refreshed.find(candidate => tabFor(candidate) === tab)?.id ?? null);
        }
      } else if (action === "remove") {
        setLibrary(previous => previous ? { ...previous, templates: previous.templates.filter(candidate => candidate.id !== item.id) } : previous);
        if (selected === item.id) setSelected(null);
      } else {
        setMessage("The change was saved. Reload the page to see it.");
      }
      toast(action === "remove" ? `${item.name} deleted` : action === "rename" ? "Name saved" : "Copy created");
    } catch { setMessage("We couldn't change that template. Please try again."); }
    finally { setBusy(false); }
  }

  function selectTab(next: string) {
    if (next !== "templates" && next !== "blocks") return;
    setTab(next);
    if (current && tabFor(current) !== next) setSelected(null);
  }

  function cards(list: Template[], label: string) {
    return <div className="tpl-grid" role="list" aria-label={label}>
      {list.map(item => <article key={item.id} role="listitem" className={`tpl-card${item.id === selected ? " is-on" : ""}`} aria-labelledby={`tpl-${item.id}`}>
        <div className="tpl-card-head"><h2 id={`tpl-${item.id}`}>{item.name}</h2><span className="cwl-g-template-kind">{templateKind(item)}</span></div>
        <p className="show-muted">{length(item.minutes)} · {item.count} {item.count === 1 ? "step" : "steps"}</p>
        <p className="show-help">{templateByline(item)}</p>
        <div className="tpl-card-foot">
          <Button variant="primary" size="small" aria-label={`Use ${item.name}`} onClick={() => { setSelected(item.id); setStarting(item.id); }}><Play aria-hidden="true" />Use</Button>
          <Button size="small" aria-pressed={item.id === selected} onClick={() => setSelected(item.id)}>Preview</Button>
          {(library?.can_manage || item.can_remove) && <Menu label={`Actions for ${item.name}`} items={[
            ...(library?.can_manage && item.can_remove ? [{ label: "Rename", disabled: busy, onSelect: () => { setName(item.name); setMessage(""); setRenaming(item); } }] : []),
            ...(library?.can_manage ? [{ label: "Duplicate", disabled: busy, onSelect: () => void manage("duplicate", item) }] : []),
            ...(item.can_remove ? [{ label: "Delete", danger: true, disabled: busy, onSelect: () => { setMessage(""); setAsking(item); } }] : []),
          ]} />}
        </div>
      </article>)}
      {!list.length && <p className="show-empty">{label === "Blocks" ? "No saved blocks yet." : "No templates yet."}</p>}
    </div>;
  }

  return <main id="main" className="show-app cwl-g-template-library">
    <ShellNav admin={admin} />
    <div className="show-workspace">
      <div className="show-private"><EyeOff size={15} aria-hidden="true" />Only you see this</div>
      <div className="cwl-g-template-content">
        <PageHeader title="Templates and blocks" lead="Start an event from a template, or drop a saved block into a run of show." />
        {message && !renaming && !asking && <p className="show-message is-error" role="alert">{message}</p>}
        {!library ? <p className="show-message is-error" role="alert">We couldn&rsquo;t load the templates. Reload the page to try again.</p> :
          <>
            <Tabs label="Template library" value={tab} onChange={selectTab} items={[
              { id: "templates", label: "Templates", count: templates.length },
              { id: "blocks", label: "Blocks", count: blocks.length },
            ]} />
            <div className={`tpl-body${current ? "" : " cwl-g-no-preview"}`}>
              <div className="cwl-g-template-cards">
                <TabPanel id="templates" active={tab === "templates"}>{tab === "templates" && cards(templates, "Templates")}</TabPanel>
                <TabPanel id="blocks" active={tab === "blocks"}>{tab === "blocks" && cards(blocks, "Blocks")}</TabPanel>
              </div>
              {current && <aside className="tpl-panel" aria-labelledby="tpl-panel-title">
                <div className="show-panel-head"><h2 id="tpl-panel-title">{current.name}</h2>
                  <Button iconOnly variant="quiet" aria-label="Close preview" onClick={() => setSelected(null)}><X aria-hidden="true" /></Button>
                </div>
                <div className="tpl-panel-body">
                  {current.description && <p className="show-muted">{current.description}</p>}
                  {parts.map(part => {
                    const list = current.sessions.filter(step => step.part === part);
                    if (!list.length) return null;
                    let at = 0;
                    return <section key={part} aria-label={part}><h3>{part}</h3><ol className="tpl-sessions">{list.map((step, index) => {
                      const time = step.mode === "live" ? clock(at) : "Self-paced";
                      if (step.mode === "live") at += step.planned_minutes;
                      return <li key={index}><span className="rb-time">{time}</span><div className="rb-name"><strong>{step.title}</strong><span className="show-muted">{kindLabel(step.interaction, step.screen)} · {step.planned_minutes} min{step.state === "draft" ? " · Draft" : ""}</span></div></li>;
                    })}</ol></section>;
                  })}
                </div>
                <div className="show-panel-foot"><Button onClick={() => setStarting(current.id)}><Play aria-hidden="true" />{current.block ? "Use this block" : "Use this template"}</Button></div>
              </aside>}
            </div>
          </>}
      </div>
    </div>
    <Dialog open={Boolean(renaming)} onClose={() => { if (!busy) setRenaming(null); }} label="Rename template" className="cwl-g-rename-template">
      <h2>Rename {renaming?.block ? "block" : "template"}</h2>
      <form className="form-stack" onSubmit={event => { event.preventDefault(); if (renaming && name.trim()) void manage("rename", renaming, name); }}>
        <label>Name<input value={name} required maxLength={120} data-initial-focus onChange={event => setName(event.target.value)} /></label>
        {message && <p role="alert">{message}</p>}
        <div className="admin-actions"><Button disabled={busy} onClick={() => setRenaming(null)}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>Save name</Button></div>
      </form>
    </Dialog>
    <ConfirmDialog open={Boolean(asking)} title={`Delete ${asking?.name ?? "this template"}?`}
      description={<>Engagements already started from it keep their sessions.{message && <p role="alert">{message}</p>}</>}
      cancelLabel="Keep it" confirmLabel="Delete" onCancel={() => setAsking(null)} busy={busy} onConfirm={() => { if (asking) void manage("remove", asking); }} />
    {starting && library && <StartEngagement library={library} template={starting} engagement={engagement} admin={admin} onClose={() => setStarting(null)} onStarted={(id, count) => { setStarting(null); router.push(`/admin/${id}/run-of-show?from=template&count=${count}`); }} />}
  </main>;
}

// Apply a template to an existing engagement: copies every session into the engagement's run of
// show, after any it already has, with its times starting where the facilitator chooses.
function StartEngagement({ library, template, engagement, admin, onClose, onStarted }: { library: Library; template: string; engagement: string | null; admin: boolean; onClose: () => void; onStarted: (id: string, count: number) => void }) {
  const [tpl, setTpl] = useState(template), [eng, setEng] = useState(() => engagement && library.engagements.some(e => e.id === engagement) ? engagement : library.engagements.find(e => e.sessions === 0)?.id ?? library.engagements[0]?.id ?? "");
  const target = library.engagements.find(e => e.id === eng), chosen = library.templates.find(t => t.id === tpl), preCall = !!chosen?.sessions.some(x => x.part === "Pre-call");
  const [start, setStart] = useState(() => target ? tomorrowAtNine(target.timezone) : ""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const zone = target?.timezone ?? "America/Toronto", first = useRef<HTMLSelectElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); }; document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key); }, [busy, onClose]);
  const already = useMemo(() => target?.sessions ?? 0, [target]);
  async function go(event: FormEvent) {
    event.preventDefault(); setMessage("");
    let at: string | null = null;
    try { at = zonedInstant(start, zone); } catch { setMessage("Check the start time. During a daylight saving clock change, choose a different time."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply", input: { template: tpl, engagement: eng, start: at } }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.status !== "ok") { setMessage(result.message || "We couldn’t start from that template. Please try again."); return; }
      onStarted(eng, result.count);
    } catch { setMessage("We couldn’t start from that template. Please try again."); }
    finally { setBusy(false); }
  }
  return <div className="rb-scrim" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <form className="rb-modal" role="dialog" aria-modal="true" aria-labelledby="start-title" onSubmit={go}>
      <div className="rb-modal-head"><h2 id="start-title">Use a template</h2><button type="button" className="show-button is-icon" aria-label="Close" disabled={busy} onClick={onClose}><X size={20} aria-hidden="true" /></button></div>
      <div className="rb-modal-body">
        {library.engagements.length ? <>
          <label htmlFor="start-engagement">Engagement<Select ref={first} id="start-engagement" value={eng} onChange={e => { setEng(e.target.value); const next = library.engagements.find(x => x.id === e.target.value); if (next) setStart(tomorrowAtNine(next.timezone)); }}>
            {library.engagements.map(e => <option key={e.id} value={e.id}>{e.church} · {e.title}{e.sessions ? ` (${e.sessions} ${e.sessions === 1 ? "session" : "sessions"})` : ""}</option>)}</Select>
            <span className="show-help">{admin ? <>A new church? <Link className="text-link" href="/admin/new">Create the engagement</Link> first, then start it here.</> : "Engagements you facilitate. An admin creates new ones."}</span></label>
          <label htmlFor="start-template">Template<Select id="start-template" value={tpl} onChange={e => setTpl(e.target.value)}>{library.templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></label>
          <label htmlFor="start-time">{preCall ? "Pre-call starts" : "First session starts"}<input id="start-time" type="datetime-local" required value={start} onChange={e => setStart(e.target.value)} /><span className="show-help">{preCall ? `In ${zone}. Discover is set before it, and Day 1 and Day 2 after it.` : `In ${zone}. Each session starts when the one before it ends.`}</span></label>
          <p className="show-muted">Copies {chosen?.count ?? 0} {chosen?.count === 1 ? "session" : "sessions"} with their prompts, settings, timings and presenter notes. You can change anything after.{already ? ` They go after the ${already} ${already === 1 ? "session" : "sessions"} already in this run of show.` : ""}</p>
        </> : <p>{admin ? <>Create the engagement in <Link className="text-link" href="/admin/new">setup</Link> first, then start it from a template here.</> : "You don’t have an open engagement yet. An admin creates it, then you can start it from a template."}</p>}
        {message && <p className="show-message is-error" role="alert">{message}</p>}
      </div>
      <div className="rb-modal-foot"><button type="button" className="show-button" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="submit" className="show-button is-primary" disabled={busy || !eng || !tpl}><Play size={16} aria-hidden="true" />{busy ? "Applying…" : "Apply template"}</button></div>
    </form>
  </div>;
}

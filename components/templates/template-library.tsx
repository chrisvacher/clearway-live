"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, EyeOff, FlaskConical, LayoutDashboard, LayoutTemplate, Play, Plus, Trash2, X } from "lucide-react";
import { kindLabel } from "@/lib/interactions/kinds";
import { clock } from "@/lib/run-of-show/builder";
import { parts } from "@/lib/run-of-show/types";
import { removeTemplateQuestion } from "@/lib/templates/policy";
import { localTime, zonedInstant } from "@/lib/setup/policy";
import { practiceId } from "@/lib/room/practice";
import type { Template, TemplateLibrary as Library } from "@/lib/templates/types";
import "@/components/run-of-show/builder.css";

// "90 minutes", "2 hours", "2 hours 15 minutes".
export function length(minutes: number) {
  if (minutes < 120) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${h} hours${m ? ` ${m} minutes` : ""}`;
}
const dated = (iso: string) => new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(new Date(iso));
const byLine = (t: Template) => t.kind === "shipped" ? "Ships with the app" : `Saved by ${t.mine ? "you" : t.by ?? "a Clearway facilitator"} · ${dated(t.created_at)}`;

// A starting time a day ahead, at 9:00 in the engagement's time zone.
function tomorrowAtNine(timezone: string) {
  const today = localTime(new Date().toISOString(), timezone).slice(0, 10);
  const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1);
  return `${d.toISOString().slice(0, 10)}T09:00`;
}

// SET-08: the template library with the team workshop template, Start an engagement from a
// template, and Remove template for the facilitator's own.
export function TemplateLibrary({ initial, admin, engagement, template }: { initial: Library | null; admin: boolean; engagement: string | null; template: string | null }) {
  const router = useRouter();
  const [library, setLibrary] = useState(initial), [selected, setSelected] = useState<string | null>(() => template ?? initial?.templates.find(t => t.kind === "shipped")?.id ?? initial?.templates[0]?.id ?? null);
  const [starting, setStarting] = useState<string | null>(null), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [asking, setAsking] = useState<string | null>(null);
  const current = library?.templates.find(t => t.id === selected) ?? null;
  async function remove(t: Template) {
    setAsking(null); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove", input: { template: t.id } }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.status !== "ok") { setMessage(result.message || "We couldn’t remove the template. Please try again."); return; }
      const next = await fetch("/api/templates", { cache: "no-store" }).then(r => r.json());
      if (next.status === "ok") { setLibrary({ templates: next.templates, engagements: next.engagements }); setSelected(next.templates[0]?.id ?? null); }
      setMessage(`${t.name} removed.`);
    } catch { setMessage("We couldn’t remove the template. Please try again."); }
    finally { setBusy(false); }
  }
  return <main id="main" className="show-app">
    <nav className="show-sidebar" aria-label="Clearway">
      <p className="show-brand">Clearway</p>
      <Link href="/setup"><LayoutDashboard aria-hidden="true" size={18} />Engagements</Link>
      <Link href="/setup/templates" aria-current="page"><LayoutTemplate aria-hidden="true" size={18} />Templates</Link>
      <Link href={`/setup/${practiceId}`}><FlaskConical aria-hidden="true" size={18} />Practice room</Link>
    </nav>
    <div className="show-workspace">
      <div className="show-private"><EyeOff size={15} aria-hidden="true" />Only you see this</div>
      <header className="show-header"><div><p className="show-eyebrow">Library</p><h1>Templates</h1></div><div className="show-actions">
        <button className="show-button is-primary" type="button" disabled={!library?.templates.length} onClick={() => setStarting(current?.id ?? library?.templates[0]?.id ?? null)}><Plus size={18} aria-hidden="true" />Start an engagement</button>
      </div></header>
      {message && <div className="show-message" role="status">{message}</div>}
      {!library ? <p className="show-message is-error" role="alert">We couldn’t load the templates. Reload the page to try again.</p> :
      <div className="tpl-body">
        <div className="tpl-grid" role="list" aria-label="Templates">
          {library.templates.map(t => <article key={t.id} role="listitem" className={`tpl-card${t.id === selected ? " is-on" : ""}`} aria-labelledby={`tpl-${t.id}`}>
            <div className="tpl-card-head"><h2 id={`tpl-${t.id}`}>{t.name}</h2>{t.kind === "shipped" && <span className="rb-chip is-ready"><BadgeCheck aria-hidden="true" />Clearway</span>}</div>
            <p className="show-muted">{length(t.minutes)} · {t.count} {t.count === 1 ? "session" : "sessions"}</p>
            <p className="show-help">{byLine(t)}</p>
            <div className="tpl-card-foot">
              <button type="button" className={`show-button${t.id === selected ? " is-primary" : ""}`} aria-label={`Use ${t.name}`} onClick={() => { setSelected(t.id); setStarting(t.id); }}><Play size={16} aria-hidden="true" />Use</button>
              <button type="button" className="show-button" aria-pressed={t.id === selected} onClick={() => setSelected(t.id)}>Preview</button>
            </div>
          </article>)}
          {!library.templates.length && <p className="show-empty">No templates yet. Save any run of show as a template from its run of show.</p>}
        </div>
        {current && <aside className="tpl-panel" aria-labelledby="tpl-panel-title">
          <div className="show-panel-head"><div><p className="show-eyebrow">Template</p><h2 id="tpl-panel-title">{current.name}</h2></div><button type="button" className="show-button is-icon" aria-label="Close preview" onClick={() => setSelected(null)}><X size={20} aria-hidden="true" /></button></div>
          <div className="tpl-panel-body">
            {current.description && <p className="show-muted">{current.description}</p>}
            {parts.map(part => {
              const list = current.sessions.filter(s => s.part === part); if (!list.length) return null;
              let at = 0;
              return <section key={part} aria-label={part}><h3>{part}</h3><ol className="tpl-sessions">{list.map((s, i) => {
                const time = s.mode === "live" ? clock(at) : "Self-paced"; if (s.mode === "live") at += s.planned_minutes;
                return <li key={i}><span className="rb-time">{time}</span><div className="rb-name"><strong>{s.title}</strong><span className="show-muted">{kindLabel(s.interaction, s.screen)} · {s.planned_minutes} min{s.state === "draft" ? " · Draft" : ""}</span></div></li>;
              })}</ol></section>;
            })}
          </div>
          <div className="show-panel-foot">{current.can_remove && (asking === current.id
              ? <span className="show-message" role="alert" data-remove-confirm>{removeTemplateQuestion(current.name)}{" "}
                <button type="button" className="show-button is-small" disabled={busy} onClick={() => void remove(current)}>Remove template</button>{" "}
                <button type="button" className="show-button is-small" onClick={() => setAsking(null)}>Keep it</button></span>
              : <button type="button" className="show-button" disabled={busy} onClick={() => setAsking(current.id)}><Trash2 size={16} aria-hidden="true" />Remove template</button>)}
            <button type="button" className="show-button is-primary" onClick={() => setStarting(current.id)}><Play size={16} aria-hidden="true" />Use this template</button></div>
        </aside>}
      </div>}
    </div>
    {starting && library && <StartEngagement library={library} template={starting} engagement={engagement} admin={admin} onClose={() => setStarting(null)} onStarted={(id, count) => { setStarting(null); router.push(`/setup/${id}/run-of-show?from=template&count=${count}`); }} />}
  </main>;
}

// Start an engagement from a template: copies every session into the engagement's run of
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
      <div className="rb-modal-head"><h2 id="start-title">Start an engagement</h2><button type="button" className="show-button is-icon" aria-label="Close" disabled={busy} onClick={onClose}><X size={20} aria-hidden="true" /></button></div>
      <div className="rb-modal-body">
        {library.engagements.length ? <>
          <label htmlFor="start-engagement">Engagement<select ref={first} id="start-engagement" value={eng} onChange={e => { setEng(e.target.value); const next = library.engagements.find(x => x.id === e.target.value); if (next) setStart(tomorrowAtNine(next.timezone)); }}>
            {library.engagements.map(e => <option key={e.id} value={e.id}>{e.church} · {e.title}{e.sessions ? ` (${e.sessions} ${e.sessions === 1 ? "session" : "sessions"})` : ""}</option>)}</select>
            <span className="show-help">{admin ? <>A new church? <Link className="text-link" href="/setup/new">Create the engagement</Link> first, then start it here.</> : "Engagements you facilitate. An admin creates new ones."}</span></label>
          <label htmlFor="start-template">Template<select id="start-template" value={tpl} onChange={e => setTpl(e.target.value)}>{library.templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <label htmlFor="start-time">{preCall ? "Pre-call starts" : "First session starts"}<input id="start-time" type="datetime-local" required value={start} onChange={e => setStart(e.target.value)} /><span className="show-help">{preCall ? `In ${zone}. Discover is set before it, and Day 1 and Day 2 after it.` : `In ${zone}. Each session starts when the one before it ends.`}</span></label>
          <p className="show-muted">Copies {chosen?.count ?? 0} {chosen?.count === 1 ? "session" : "sessions"} with their prompts, settings, timings and presenter notes. You can change anything after.{already ? ` They go after the ${already} ${already === 1 ? "session" : "sessions"} already in this run of show.` : ""}</p>
        </> : <p>{admin ? <>Create the engagement in <Link className="text-link" href="/setup/new">setup</Link> first, then start it from a template here.</> : "You don’t have an open engagement yet. An admin creates it, then you can start it from a template."}</p>}
        {message && <p className="show-message is-error" role="alert">{message}</p>}
      </div>
      <div className="rb-modal-foot"><button type="button" className="show-button" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="submit" className="show-button is-primary" disabled={busy || !eng || !tpl}><Play size={18} aria-hidden="true" />{busy ? "Starting..." : "Start engagement"}</button></div>
    </form>
  </div>;
}

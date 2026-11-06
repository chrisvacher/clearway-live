"use client";
import { useState } from "react";
import { Loader2, Plus, RotateCcw, TriangleAlert } from "lucide-react";
import { AiIcon } from "@/components/interactions/ai/ai-icon";
import { columnLabel, draftView, type ThemesState } from "@/lib/discover/themes";
import { ThemeList } from "./theme-list";
import type { ThemeReply } from "./use-themes";

type Send = (body: Record<string, unknown>) => Promise<ThemeReply>;

// The Themes part of Discover (SET-06): Draft themes (and Redraft, which keeps what was accepted), the themes, the ones turned down, and a way to
// write a theme by hand that never waits on AI. When AI is slow or has failed, the page says so and the by-hand form is the way on (FAIL-09).
export function ThemesPanel({ state, now, send, closed }: { state: ThemesState; now: number; send: Send; closed: boolean }) {
  const [say, setSay] = useState(""), [busy, setBusy] = useState(false), [adding, setAdding] = useState(false);
  const view = draftView(state, now, state.slow_after_ms);
  const hasDrafted = state.themes.some(t => t.ai && t.source !== "survey");
  const working = view.kind === "working";
  async function draft() {
    setBusy(true); setSay("");
    const reply = await send({ action: "draft", id: crypto.randomUUID() });
    setBusy(false);
    if (reply.status !== "ok" && reply.status !== "duplicate") setSay(reply.message || "We couldn't start that. Try again.");
  }
  const rejected = state.themes.filter(t => t.status === "rejected");
  const canDraft = !closed && !working && view.kind !== "off" && view.kind !== "nothing";
  return <div className="dsc-themes-panel">
    <div className="dsc-draftbar">
      <button type="button" className="dsc-btn is-primary" disabled={!canDraft || busy} onClick={() => void draft()}>
        {working || busy ? <Loader2 className="dsc-spin" aria-hidden="true" /> : <AiIcon size={16} />}{hasDrafted || view.kind === "done" ? "Redraft themes" : "Draft themes"}</button>
      {!closed ? <button type="button" className="dsc-btn" onClick={() => setAdding(a => !a)} aria-expanded={adding}><Plus aria-hidden="true" />Add a theme by hand</button> : null}
      <p className={`dsc-draftnote${view.kind === "failed" || (view.kind === "working" && view.slow) ? " is-warn" : ""}`} role="status" aria-live="polite" data-draft={view.kind}>
        {view.kind === "off" ? "AI is off for this engagement. You can still add themes by hand."
          : view.kind === "nothing" ? "Add conversation notes, or run the Four Helpful Lists, and AI can draft themes from them."
          : view.kind === "ready" ? "AI reads your conversation notes and the Four Helpful Lists cards and offers themes. You decide which count."
          : view.kind === "working" ? (view.slow ? <><TriangleAlert aria-hidden="true" />This is taking longer than usual. You can keep working, or add a theme by hand.</> : <>{view.redraft ? "Looking for new themes beside the ones you accepted." : "Reading your notes and cards."} New themes appear here as they arrive.</>)
          : view.kind === "failed" ? <><TriangleAlert aria-hidden="true" />AI couldn&apos;t draft themes this time. Press Redraft themes to try again, or add a theme by hand.</>
          : `AI offered ${view.offered} ${view.offered === 1 ? "theme" : "themes"}${view.refused ? `, and ${view.refused} didn't hold up against your sources` : ""}.${view.stale ? ` ${view.stale} ${view.stale === 1 ? "note was" : "notes were"} added since, so Redraft themes will read ${view.stale === 1 ? "it" : "them"}.` : ""}${view.leftOut ? ` ${view.leftOut} long ${view.leftOut === 1 ? "note was" : "notes were"} cut short to fit.` : ""}`}
      </p>
    </div>
    <p className={`dsc-status${say ? " is-err" : ""}`} role="status" aria-live="polite">{say}</p>
    {adding && !closed ? <AddTheme state={state} send={send} done={() => setAdding(false)} /> : null}
    <ThemeList themes={state.themes} send={send} closed={closed} />
    {rejected.length ? <details className="dsc-rejected"><summary>Rejected themes ({rejected.length})</summary>
      <ul>{rejected.map(t => <li key={t.id}><span>{t.label}</span>
        {!closed && t.source !== "survey" ? <button type="button" className="dsc-btn is-compact is-ghost" onClick={() => void send({ action: "restore", theme: t.id })}><RotateCcw aria-hidden="true" />Bring back</button> : null}</li>)}</ul></details> : null}
  </div>;
}

function AddTheme({ state, send, done }: { state: ThemesState; send: Send; done: () => void }) {
  const [source, setSource] = useState<"conversations" | "four_lists">("conversations");
  const [label, setLabel] = useState(""), [detail, setDetail] = useState(""), [picked, setPicked] = useState<string[]>([]), [say, setSay] = useState(""), [busy, setBusy] = useState(false);
  const [id] = useState(() => crypto.randomUUID());
  const options = source === "conversations" ? state.notes.map(n => ({ id: n.id, text: n.title })) : state.cards.map(c => ({ id: c.id, text: `${columnLabel[c.column]}: ${c.text}` }));
  const toggle = (v: string) => setPicked(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v]);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setSay("");
    const reply = await send({ action: "add", id, source, label, detail, sources: picked });
    setBusy(false);
    if (reply.status === "ok" || reply.status === "duplicate") done(); else setSay(reply.message || "We couldn't save that. Try again.");
  }
  return <form className="dsc-add" onSubmit={e => void submit(e)} aria-label="Add a theme by hand">
    <label>What kind of theme<select className="dsc-select" value={source} onChange={e => { setSource(e.target.value as typeof source); setPicked([]); }}>
      <option value="conversations">From interviews and conversations</option><option value="four_lists">From the Four Helpful Lists</option></select></label>
    <label>Theme<input className="dsc-input" value={label} maxLength={220} onChange={e => setLabel(e.target.value)} /></label>
    <label>Detail, if any<input className="dsc-input" value={detail} maxLength={1020} onChange={e => setDetail(e.target.value)} /></label>
    <fieldset><legend>It rests on</legend>
      {options.length ? <ul>{options.slice(0, 60).map(o => <li key={o.id}><label><input type="checkbox" checked={picked.includes(o.id)} onChange={() => toggle(o.id)} />{o.text}</label></li>)}</ul>
        : <p className="dsc-muted">{source === "conversations" ? "No notes yet." : "No cards yet."}</p>}</fieldset>
    <div className="acts"><button type="submit" className="dsc-btn is-primary" disabled={busy || !label.trim()}>Add and accept</button>
      <button type="button" className="dsc-btn" onClick={done}>Cancel</button></div>
    <p className={`dsc-status${say ? " is-err" : ""}`} role="status" aria-live="polite">{say}</p>
  </form>;
}

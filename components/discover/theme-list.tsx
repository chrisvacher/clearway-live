"use client";
import { useRef, useState } from "react";
import { Check, Clipboard, Columns4, Merge, MessageSquareText, Pencil, Undo2, X } from "lucide-react";
import { restsOnLabel } from "@/lib/discover/thin";
import { strength } from "@/lib/discover/strength";
import type { Theme } from "@/lib/discover/types";
import { columnLabel, themeStrength, type ThemeRow, type ThemeSourceRow } from "@/lib/discover/themes";
import { AiMark } from "@/components/interactions/ai/ai-icon";
import { StrongMark, ThinFlag } from "./thin-flag";
import { glideInto, leave, useFlip, useRoll } from "./theme-motion";
import type { ThemeReply } from "./use-themes";

const sourceLabel = { survey: "Survey", conversations: "Interviews and conversations", four_lists: "Four Helpful Lists" } as const;
const sourceIcon = { survey: Clipboard, conversations: MessageSquareText, four_lists: Columns4 } as const;
const order = { conversations: 0, four_lists: 1, survey: 2 } as const;
type Send = (body: Record<string, unknown>) => Promise<ThemeReply>;

// The sources a theme rests on, beside it: a note by its title, a card by its list and words, a finding by its title. Never a person.
function Sources({ sources }: { sources: ThemeSourceRow[] }) {
  const shown = sources.slice(0, 6), more = sources.length - shown.length;
  if (!sources.length) return <p className="srcs dsc-muted">Rests on no sources yet.</p>;
  return <div className="srcs"><span className="lead">Rests on</span>
    <ul aria-label="Sources">{shown.map((s, i) => {
      const Icon = s.kind === "note" ? MessageSquareText : s.kind === "card" ? Columns4 : Clipboard;
      const text = s.kind === "card" ? `${s.column ? columnLabel[s.column] : "Card"}: ${s.text ?? ""}` : s.title ?? "Note";
      return <li key={`${s.kind}-${s.id}-${i}`} title={text}><Icon aria-hidden="true" /><span>{text}</span></li>;
    })}{more > 0 ? <li className="more">and {more} more</li> : null}</ul></div>;
}

// DiscoverTheme (design pass 6): the label, what it rests on ("4 of 5"), a bar for shares, its source, the AI icon on a drafted theme, thin or
// strong, its quotes and sources, and Accept, Rename, Merge and Reject. Survey themes follow their finding and have no actions.
export function DiscoverTheme({ theme: t, themes, send, closed }: { theme: ThemeRow; themes: ThemeRow[]; send: Send; closed: boolean }) {
  const ref = useRef<HTMLLIElement>(null);
  const [mode, setMode] = useState<"view" | "rename" | "merge">("view");
  const [name, setName] = useState(t.label), [into, setInto] = useState(""), [busy, setBusy] = useState(false), [say, setSay] = useState("");
  const s = themeStrength(t), counts = { source: t.source, restsOn: t.rests_on, outOf: t.out_of }, Icon = sourceIcon[t.source];
  const rolled = useRoll(t.rests_on), survey = t.source === "survey", accepted = t.status === "accepted";
  const targets = themes.filter(x => x.id !== t.id && x.source === t.source && x.status !== "rejected");
  const pct = t.out_of && t.out_of > 0 ? Math.min(100, (t.rests_on / t.out_of) * 100) : 0;
  const finish = (reply: ThemeReply) => { setBusy(false); setSay(reply.status === "ok" || reply.status === "unchanged" ? "" : reply.message || "We couldn't save that. Try again."); return reply.status === "ok"; };
  async function act(action: string, extra: Record<string, unknown> = {}) { setBusy(true); const ok = finish(await send({ action, theme: t.id, ...extra })); if (ok) setMode("view"); return ok; }
  async function reject() {
    setBusy(true); const undo = await leave(ref.current);
    if (!finish(await send({ action: "reject", theme: t.id }))) undo();
  }
  async function merge() {
    const target = document.querySelector<HTMLElement>(`[data-k="${CSS.escape(into)}"]`);
    setBusy(true); const glide = await glideInto(ref.current, target);
    const ok = finish(await send({ action: "merge", theme: t.id, into }));
    if (ok) glide.settle(); else glide.undo();
  }
  const rest = restsOnLabel(counts).replace(/^\d+\s?/, "") || "respondents";
  return <li ref={ref} data-k={t.id} className={`dsc-theme${accepted ? " is-accepted" : ""}${s.thin ? " is-thin" : ""}`} aria-label={t.label}>
    <div className="top"><div className="lb"><b className="label">{t.label}</b>
        {t.renamed_from ? <span className="was"><Pencil aria-hidden="true" />Renamed from {t.renamed_from}</span> : null}
        {t.members.length ? <span className="was"><Merge aria-hidden="true" />Merged from {t.members.length} {t.members.length === 1 ? "theme" : "themes"}</span> : null}</div>
      <div className="rest"><b className="cnt">{rolled}</b><span>{rest}</span></div></div>
    {t.detail ? <span className="detail">{t.detail}</span> : null}
    {t.source !== "conversations" && t.out_of ? <div className="tr" aria-hidden="true"><i style={{ width: `${pct.toFixed(2)}%` }} /></div> : null}
    <div className="marks"><span className="dsc-chip"><Icon aria-hidden="true" />{sourceLabel[t.source]}</span>
      <span className="dsc-chip">{survey ? "From a finding" : accepted ? "Accepted" : "Draft"}</span>
      {t.by_hand ? <span className="dsc-chip">Written by hand</span> : null}
      {t.ai ? <span className="dsc-ai"><AiMark label="Drafted by AI" />Drafted by AI</span> : null}
      {s.thin ? <ThinFlag reason={s.thinReason} /> : s.strong ? <StrongMark /> : null}</div>
    {t.quotes.length ? <ul className="qs" aria-label="Quotes">{t.quotes.slice(0, 2).map((q, i) => <li key={i}>“{q}”</li>)}</ul> : null}
    <Sources sources={t.sources} />
    {t.members.length && !closed ? <details className="members"><summary>Merged themes ({t.members.length})</summary>
      <ul>{t.members.map(m => <li key={m.id}><span>{m.label}</span>
        <button type="button" className="dsc-btn is-compact is-ghost" disabled={busy} onClick={async () => { setBusy(true); finish(await send({ action: "split", theme: m.id })); }}>Split out</button></li>)}</ul></details> : null}
    {!survey && !closed ? mode === "rename" ? <form className="acts" onSubmit={e => { e.preventDefault(); void act("rename", { label: name }); }}>
        <input className="dsc-input is-sm" aria-label="Theme name" value={name} maxLength={220} onChange={e => setName(e.target.value)} autoFocus />
        <button type="submit" className="dsc-btn is-compact is-primary" disabled={busy || !name.trim()}>Save name</button>
        <button type="button" className="dsc-btn is-compact" onClick={() => { setMode("view"); setName(t.label); }}>Cancel</button></form>
      : mode === "merge" ? <form className="acts" onSubmit={e => { e.preventDefault(); if (into) void merge(); }}>
        <select className="dsc-select is-sm" aria-label="Merge into" value={into} onChange={e => setInto(e.target.value)}>
          <option value="">Choose a theme</option>{targets.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
        <button type="submit" className="dsc-btn is-compact is-primary" disabled={busy || !into}>Merge into it</button>
        <button type="button" className="dsc-btn is-compact" onClick={() => setMode("view")}>Cancel</button></form>
      : <div className="acts">
        {accepted ? <><span className="dsc-chip is-success"><Check aria-hidden="true" />Accepted</span>
            <button type="button" className="dsc-btn is-compact is-ghost" disabled={busy} onClick={() => void act("undo")}><Undo2 aria-hidden="true" />Undo</button></>
          : <button type="button" className="dsc-btn is-compact is-primary" disabled={busy} onClick={() => void act("accept")}><Check aria-hidden="true" />Accept</button>}
        <button type="button" className="dsc-btn is-compact" disabled={busy} onClick={() => { setName(t.label); setMode("rename"); }}><Pencil aria-hidden="true" />Rename</button>
        {targets.length ? <button type="button" className="dsc-btn is-compact" disabled={busy} onClick={() => { setInto(""); setMode("merge"); }}><Merge aria-hidden="true" />Merge</button> : null}
        {!accepted ? <button type="button" className="dsc-btn is-compact is-ghost" disabled={busy} onClick={() => void reject()}><X aria-hidden="true" />Reject</button> : null}
      </div> : null}
    <p className={`dsc-status${say ? " is-err" : ""}`} role="status" aria-live="polite">{say}</p>
  </li>;
}

// ThemeList (design pass 6): the themes that are still in play, interviews first, then the Four Helpful Lists, then the survey, each group by what
// it rests on. A count that grows rolls, a bar grows from its length, themes trade places by gliding, a new one arrives.
export function ThemeList({ themes, send, closed }: { themes: ThemeRow[]; send: Send; closed: boolean }) {
  const list = useRef<HTMLUListElement>(null);
  const shown = themes.filter(t => t.status !== "rejected").sort((a, b) => order[a.source] - order[b.source] || b.rests_on - a.rests_on);
  useFlip(list, shown.map(t => t.id));
  if (!shown.length) return <p className="dsc-empty" role="status">No themes yet. Each survey finding you save becomes a theme here, and Draft themes offers more from your notes and cards.</p>;
  return <ul ref={list} className="dsc-list dsc-themes" aria-label="Themes">{shown.map(t => <DiscoverTheme key={t.id} theme={t} themes={themes} send={send} closed={closed} />)}</ul>;
}

// Until the themes functions are in the database, the list the page always had: survey themes, read only.
export function ReadOnlyThemes({ themes }: { themes: Theme[] }) {
  const shown = themes.filter(t => t.status !== "rejected" && !t.merged_into);
  if (!shown.length) return <p className="dsc-empty" role="status">No themes yet. Each survey finding you save becomes a theme here.</p>;
  return <ul className="dsc-list" aria-label="Themes">{shown.map(t => {
    const counts = { source: t.source, restsOn: t.rests_on, outOf: t.out_of }, s = strength(counts), Icon = sourceIcon[t.source];
    return <li key={t.id} className={`dsc-theme${t.status === "accepted" ? " is-accepted" : ""}`}>
      <div className="top"><b className="label">{t.label}</b><span className="rest"><b>{t.rests_on}</b><span>{restsOnLabel(counts).replace(/^\d+\s?/, "") || "respondents"}</span></span></div>
      {t.detail ? <span className="dsc-muted">{t.detail}</span> : null}
      <div className="marks"><span className="dsc-chip"><Icon aria-hidden="true" />{sourceLabel[t.source]}</span>
        <span className="dsc-chip">{t.status === "accepted" ? "Accepted" : "Draft"}</span>
        {s.thin ? <ThinFlag reason={s.thinReason} /> : s.strong ? <StrongMark /> : null}</div>
    </li>;
  })}</ul>;
}

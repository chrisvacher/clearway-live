"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Check, Loader2, PenLine, Trash2, TriangleAlert } from "lucide-react";
import { AiIcon, AiMark } from "@/components/interactions/ai/ai-icon";
import { boldParts, depthBlocks } from "@/lib/interactions/kinds";
import { DETAIL_MAX, LINE_MAX, NUMBER_MAX, draftView, headlineText, heardFor, phoneDepth, sourceNote, type HeardDraft, type HeardSource, type HeardState } from "@/lib/discover/heard";
import { ThinFlag } from "./thin-flag";
import { useFlip } from "./theme-motion";
import type { HeardReply } from "./use-heard";

type Send = (body: Record<string, unknown>) => Promise<HeardReply>;

// The What We Heard part of Discover (PRE-08): Draft What We Heard (and Redraft), then one row for each of the pre-call's four sources, each
// with its step in the run of show. A draft is edited here and applied; a source with nothing accepted says so instead of inventing; and a
// headline can always be typed by hand, so the page never waits on AI (FAIL-09). Nothing here reaches the TV or phones.
export function HeardPanel({ engagement, state, now, send, closed }: { engagement: string; state: HeardState; now: number; send: Send; closed: boolean }) {
  const [say, setSay] = useState(""), [busy, setBusy] = useState(false), list = useRef<HTMLUListElement>(null);
  const view = draftView(state, now, state.slow_after_ms);
  const working = view.kind === "working";
  const verb = view.kind === "done" || state.sources.some(s => s.draft?.ai) ? "Redraft What We Heard" : "Draft What We Heard";
  const canDraft = !closed && !working && view.kind !== "off" && view.kind !== "nothing";
  useFlip(list, state.sources.map(s => s.key));
  async function draft() {
    setBusy(true); setSay("");
    const reply = await send({ action: "draft", id: crypto.randomUUID() });
    setBusy(false);
    if (reply.status !== "ok" && reply.status !== "duplicate") setSay(reply.message || "We couldn't start that. Try again.");
  }
  return <div className="dsc-heard">
    <div className="dsc-draftbar">
      <button type="button" className="dsc-btn is-primary" disabled={!canDraft || busy} onClick={() => void draft()}>
        {working || busy ? <Loader2 className="dsc-spin" aria-hidden="true" /> : <AiIcon size={16} />}{verb}</button>
      <p className={`dsc-draftnote${view.kind === "failed" || (view.kind === "working" && view.slow) ? " is-warn" : ""}`} role="status" aria-live="polite" data-draft={view.kind}>
        {view.kind === "off" ? "AI is off for this engagement. You can still type each headline by hand."
          : view.kind === "nothing" ? "Accept some themes above, and keep a What We Heard step in the run of show. Then AI can draft the headlines."
          : view.kind === "ready" ? "AI reads only the themes you accepted and offers one headline with depth for each What We Heard step. You edit each one and apply it."
          : view.kind === "working" ? (view.slow ? <><TriangleAlert aria-hidden="true" />This is taking longer than usual. You can keep working, or type a headline by hand.</> : <>Reading your accepted themes. Headlines appear here as they arrive.</>)
          : view.kind === "failed" ? <><TriangleAlert aria-hidden="true" />AI couldn&apos;t draft the headlines this time. Press {verb} to try again, or type each one by hand.</>
          : `AI offered ${view.offered} ${view.offered === 1 ? "headline" : "headlines"}${view.kept ? `, kept ${view.kept} you had edited` : ""}${view.refused ? `, and ${view.refused} didn't hold up against your themes` : ""}.`}
      </p>
    </div>
    <p className={`dsc-status${say ? " is-err" : ""}`} role="status" aria-live="polite">{say}</p>
    <ul className="dsc-heard-list" ref={list}>
      {state.sources.map(s => <li key={s.key} data-k={s.key}><SourceRow engagement={engagement} source={s} send={send} closed={closed} /></li>)}
    </ul>
  </div>;
}

function SourceRow({ engagement, source: s, send, closed }: { engagement: string; source: HeardSource; send: Send; closed: boolean }) {
  const note = sourceNote(s), live = s.step && ["live", "phones_down", "open"].includes(s.step.state);
  return <section className={`dsc-wwh-source${s.draft?.thin ? " is-thin" : ""}`} aria-labelledby={`wwh-${s.key}`} data-source={s.key}>
    <header className="dsc-wwh-head"><h3 id={`wwh-${s.key}`}>{s.name}</h3>
      <span className="dsc-muted">{s.step ? `${s.step.title}, ${s.step.part}` : "No step in the run of show"}</span>
      {live ? <span className="dsc-chip">On the TV now</span> : null}</header>
    {s.draft ? <DraftRow key={s.draft.id} source={s} draft={s.draft} send={send} closed={closed} />
      : <div className="dsc-wwh-empty">
        <p data-note={note.kind}>{note.kind === "no_step" ? <>No step in the run of show uses the source &ldquo;{s.name}&rdquo;. Add a What We Heard headline step with that source, in <Link href={`/setup/${engagement}/run-of-show`}>the run of show</Link>.</>
          : note.kind === "nothing" ? `Nothing accepted yet for ${heardFor[s.key]}. Accept themes above, or type this headline by hand.`
          : `${note.themes} accepted ${note.themes === 1 ? "theme" : "themes"}${note.thin ? `, ${note.thin} thin` : ""}. Draft What We Heard to get a headline, or type one by hand.`}</p>
        {s.step && !closed ? <HandForm source={s} send={send} /> : null}
      </div>}
  </section>;
}

// A headline typed by hand, for when AI is slow, failed or off, or the facilitator wants to start from nothing.
function HandForm({ source, send }: { source: HeardSource; send: Send }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="dsc-btn is-compact" onClick={() => setOpen(true)}><PenLine aria-hidden="true" />Type it by hand</button>;
  return <Fields source={source} draft={null} send={send} closed={false} />;
}

function DraftRow({ source, draft, send, closed }: { source: HeardSource; draft: HeardDraft; send: Send; closed: boolean }) {
  return <Fields source={source} draft={draft} send={send} closed={closed} />;
}

// The draft's fields: the number, the line, the detail and the quotes to keep, how it will read on the TV and on phones, and Apply.
function Fields({ source, draft, send, closed }: { source: HeardSource; draft: HeardDraft | null; send: Send; closed: boolean }) {
  const [number, setNumber] = useState(draft?.number ?? ""), [line, setLine] = useState(draft?.line ?? ""), [detail, setDetail] = useState(draft?.detail ?? "");
  const [keep, setKeep] = useState<boolean[]>(() => (draft?.quotes ?? []).map(() => true));
  const [busy, setBusy] = useState(false), [say, setSay] = useState<{ text: string; ok: boolean }>({ text: "", ok: true });
  const thin = draft?.thin ?? false, quotes = (draft?.quotes ?? []).filter((_, i) => keep[i]);
  const dirty = !draft || number !== draft.number || line !== draft.line || detail !== draft.detail || keep.some(k => !k);
  const applied = draft?.applied_at && !dirty;
  const shown = { detail, quotes, thin, thin_reason: draft?.thin_reason ?? null };
  async function act(action: "edit" | "apply") {
    setBusy(true); setSay({ text: "", ok: true });
    const reply = await send({ action, source: source.key, number, line, detail, ...(draft && draft.quotes.length ? { keep: keep.flatMap((k, i) => k ? [i] : []) } : {}) });
    setBusy(false);
    setSay(reply.status === "ok" ? { text: action === "apply" ? "Applied to the step. It reaches the TV and phones when the step goes live." : "Saved.", ok: true } : { text: reply.message || "We couldn't save that. Try again.", ok: false });
  }
  return <div className="dsc-wwh-draft">
    <div className="dsc-wwh">
      <label className="n">Number<input className="dsc-input tnum" value={number} maxLength={NUMBER_MAX} onChange={e => setNumber(e.target.value)} placeholder="31%" disabled={closed} /></label>
      <div className="t">
        <label>Headline line<input className="dsc-input" value={line} maxLength={LINE_MAX} onChange={e => setLine(e.target.value)} disabled={closed}
          placeholder="named **a clear way into groups** as what to improve" /></label>
        <p className="hl" aria-label="How the line reads on the TV">{line.trim() ? boldParts(headlineText(line, thin)).map((p, i) => p.bold ? <strong key={i}>{p.text}</strong> : <span key={i}>{p.text}</span>) : <span className="dsc-muted">The line reads here as you type.</span>}</p>
        <div className="meta">
          {draft?.ai ? <span className="dsc-ai"><AiMark label="Drafted by AI" />AI drafted</span> : <span className="dsc-chip"><PenLine aria-hidden="true" />Typed by hand</span>}
          {draft?.edited && draft.ai ? <span className="dsc-chip">Edited</span> : null}
          {thin ? <ThinFlag reason={draft?.thin_reason ?? ""} /> : null}
          {(draft?.rests ?? []).map((r, i) => <span key={i} className="dsc-chip" title={r.label}>{r.label.length > 40 ? `${r.label.slice(0, 40)}...` : r.label}<b>{r.count}</b></span>)}
        </div>
      </div>
    </div>
    <label className="dsc-wwh-detail">Detail on phones<textarea className="dsc-text is-short" value={detail} maxLength={DETAIL_MAX} onChange={e => setDetail(e.target.value)} disabled={closed} /></label>
    {draft && draft.quotes.length ? <fieldset className="dsc-wwh-quotes"><legend>Quotes on phones</legend>
      <ul>{draft.quotes.map((q, i) => <li key={i}><label><input type="checkbox" checked={keep[i] ?? false} disabled={closed} onChange={() => setKeep(k => k.map((v, j) => j === i ? !v : v))} />
        <span>{q.text}<small>{q.label}</small></span></label></li>)}</ul></fieldset> : null}
    <details className="dsc-wwh-phone"><summary>What phones see</summary>
      <div className="dsc-wwh-depth">{depthBlocks(phoneDepth(shown)).map((b, i) => b.kind === "quote" ? <blockquote key={i}>{b.text}{b.source ? <cite>{b.source}</cite> : null}</blockquote> : b.kind === "text" ? <p key={i}>{b.text}</p> : null)}</div></details>
    {draft?.stale ? <p className="dsc-draftnote is-warn"><TriangleAlert aria-hidden="true" />Themes changed since this was drafted. Redraft What We Heard to read them again.</p> : null}
    <div className="acts">
      <button type="button" className="dsc-btn is-primary" disabled={busy || closed || !line.trim() || !source.step} onClick={() => void act("apply")}>{busy ? <Loader2 className="dsc-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}Apply</button>
      <button type="button" className="dsc-btn" disabled={busy || closed || !line.trim() || !dirty} onClick={() => void act("edit")}>Save draft</button>
      {draft && !closed ? <button type="button" className="dsc-btn is-ghost" disabled={busy} onClick={() => void send({ action: "discard", source: source.key })}><Trash2 aria-hidden="true" />Discard draft</button> : null}
      {applied ? <span className="dsc-applied"><Check aria-hidden="true" />Applied to the step</span> : null}
    </div>
    <p className={`dsc-status${say.text && !say.ok ? " is-err" : say.text ? " is-ok" : ""}`} role="status" aria-live="polite">{say.text}</p>
  </div>;
}

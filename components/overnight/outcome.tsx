"use client";
import { useEffect, useState } from "react";
import { BadgeCheck, Camera, CircleHelp, Gavel, History, Lock, Pencil, Plus, Quote, ShieldCheck, SquareCheck, Trash2, TriangleAlert, Undo2, X, Zap } from "lucide-react";
import type { Draft, DraftBullet, DraftNote, OvernightState, SourceKind } from "./types";
import type { Api } from "./review";
import { StatusChip } from "./chips";
import { Photo } from "./photo";
import { liveBullets, markOf } from "@/lib/overnight/policy";

type Ok = Extract<OvernightState, { status: "ok" }>;
const kindIcon = { quote: Quote, decision: Gavel, tension: Zap, action: SquareCheck, question: CircleHelp, mitigation: ShieldCheck } as const;
const kindName = { quote: "Quote", decision: "Decision", tension: "Tension", action: "Action", question: "Question", mitigation: "Mitigation" } as const;
const stamp = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)).replace(/\s/g, " ");

// The words of a source with the part the bullet used lit up.
function Lit({ text, part }: { text: string; part?: string }) {
  const i = part ? text.toLowerCase().indexOf(part.toLowerCase()) : -1;
  if (i < 0 || !part) return <>{text}</>;
  return <>{text.slice(0, i)}<span className="ovr-hl">{text.slice(i, i + part.length)}</span>{text.slice(i + part.length)}</>;
}

function SourceCard({ state, draft, source, engagement, onRemove, locked }: { state: Ok; draft: Draft; source: DraftBullet["sources"][number]; engagement: string; onRemove: (() => void) | null; locked: boolean }) {
  const remove = onRemove && !locked ? <button type="button" className="ovr-btn is-icon is-ghost" aria-label="Take this source off the bullet" onClick={onRemove}><X aria-hidden="true" /></button> : null;
  if (source.kind === "bullet") {
    const room = draft.room_bullets.find(b => b.id === source.ref);
    return <div className="ovr-scard is-lit" data-testid="ovn-source"><div className="meta"><span>Phone · 3-year Vision, first pass · anonymous</span>{remove}</div><div><Lit text={room?.text ?? source.excerpt} part={source.excerpt} /></div></div>;
  }
  if (source.kind === "card") {
    const card = state.cards[source.ref];
    if (!card) return null;
    const Icon = kindIcon[card.kind], speaker = state.speakers[source.ref], extra = [card.detail.why, ...(card.detail.views ?? []), card.detail.risk].filter(Boolean).join(" · ");
    return <div className="ovr-scard is-lit" data-testid="ovn-source"><div className="meta"><span className="ovr-meta-l"><Icon aria-hidden="true" />Scribe · {kindName[card.kind]} · {card.step}</span>{remove}</div>
      <div className={card.kind === "quote" ? "ovr-quote" : ""}><Lit text={card.text} part={source.excerpt} /></div>{extra && <div className="ovr-muted">{extra}</div>}
      {(speaker || card.detail.owner) && <span className="who"><Lock aria-hidden="true" />{[speaker, card.detail.owner].filter(Boolean).join(" · ")} · for the record, never in the room</span>}</div>;
  }
  const file = state.files[source.ref];
  if (!file) return null;
  return <div className="ovr-scard is-lit" data-testid="ovn-source"><div className="meta"><span className="ovr-meta-l"><Camera aria-hidden="true" />Easel photo · {file.name} · {file.step}</span>{remove}</div>
    {file.uploaded && file.type.startsWith("image/") && file.type !== "image/heic" ? <Photo className="ovr-photo" engagement={engagement} file={source.ref} name={file.name} /> : null}
    {file.typed ? <div><span className="ovr-muted">Typed by a facilitator: </span><Lit text={file.typed} part={source.excerpt} /></div> : source.excerpt ? <div><span className="ovr-muted">Read from the photo: </span>{source.excerpt}</div> : null}</div>;
}

function Notes({ title, icon, notes, state, empty }: { title: string; icon: React.ReactNode; notes: DraftNote[]; state: Ok; empty: string }) {
  return <section className="ovr-note" data-testid={`ovn-${title.startsWith("Voices") ? "voices" : "tensions"}`}><h4>{icon}{title}</h4>
    {notes.length === 0 ? <small>{empty}</small> : notes.map(n => { const card = n.source_kind === "card" ? state.cards[n.source] : null, speaker = state.speakers[n.source];
      return <div key={n.id}><blockquote>{n.text}</blockquote><small>{card ? `${kindName[card.kind]} · ${card.step}` : "Phone · anonymous"}{speaker ? ` · ${speaker} · for the record, never in the room` : ""}</small></div>; })}</section>;
}

export function OutcomeView({ state, draft, api, engagement, back }: { state: Ok; draft: Draft; api: Api; engagement: string; back: () => void }) {
  const live = liveBullets(draft), removed = draft.bullets.filter(b => b.removed);
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<"sources" | "versions">("sources");
  const [edit, setEdit] = useState<{ id: string | null; text: string } | null>(null);
  const [versions, setVersions] = useState<{ n: number; kind: string; what: string; by: string | null; ai: boolean; at: string; current: boolean }[]>([]);
  const selected = live.find(b => b.id === sel) ?? live[0] ?? null;
  const other = draft.lock && !draft.lock.mine ? draft.lock : null;
  const rev = draft.revision;
  const shut = Boolean(other) || state.round.published_at !== null || draft.tidy === "waiting";
  const act = (body: Record<string, unknown>) => api.act({ ...body, outcome: draft.id, revision: rev });

  useEffect(() => {
    let stop = false;
    void fetch(`/api/overnight/${engagement}?versions=${draft.id}`, { cache: "no-store" }).then(r => r.json()).then((d: { status: string; versions?: typeof versions }) => { if (!stop && d.status === "ok") setVersions(d.versions ?? []); }).catch(() => {});
    return () => { stop = true; };
  }, [engagement, draft.id, draft.versions, rev]);
  // The text box open here holds the section's lock; closing it lets go.
  const startEdit = async (id: string | null, text: string) => { const r = await api.move(draft.id, true); if (r.status === "ok") setEdit({ id, text }); };
  const stopEdit = () => { setEdit(null); void api.move(draft.id, false); };

  const save = async () => {
    if (!edit) return;
    const bullets = [...live.map(b => ({ id: b.id, text: b.id === edit.id ? edit.text : b.text })), ...(edit.id === null ? [{ text: edit.text }] : [])];
    const r = await act({ action: "edit", bullets });
    if (r.status === "ok" || r.status === "unchanged") stopEdit();
  };
  const addSource = (value: string) => { const [kind, ref] = value.split(":"); if (selected && ref) void act({ action: "source", bullet: selected.id, kind: kind as SourceKind, ref, add: true }); };

  const usedKeys = new Set(selected?.sources.map(s => `${s.kind}:${s.ref}`));
  const choices: { value: string; label: string }[] = [
    ...draft.room_bullets.filter(b => !usedKeys.has(`bullet:${b.id}`)).map(b => ({ value: `bullet:${b.id}`, label: `Phone: ${b.text}` })),
    ...Object.entries(state.cards).filter(([id]) => !usedKeys.has(`card:${id}`)).map(([id, c]) => ({ value: `card:${id}`, label: `${kindName[c.kind]}: ${c.text}`.slice(0, 90) })),
    ...Object.entries(state.files).filter(([id, f]) => f.kind === "photo" && !usedKeys.has(`photo:${id}`)).map(([id, f]) => ({ value: `photo:${id}`, label: `Easel photo: ${f.name}` })) ];
  const unusedRoom = draft.room_bullets.filter(b => !b.used);
  const acceptBlock = shut ? (other ? `${other.by} is editing` : draft.tidy === "waiting" ? "Still being tidied" : "") : live.some(b => b.flag) ? "A bullet needs a source" : draft.thin && !draft.thin_ack ? "Acknowledge the thin flag first" : "";

  return <div className="ovr-outcome" data-testid="ovn-outcome" data-revision={rev}>
    <div className="ovr-pane">
      <div className="ovr-h"><button type="button" className="ovr-btn is-ghost is-sm" onClick={back}>All outcomes</button><h2>{draft.name}</h2>
        <span className="ovr-prov">{draft.reviewed ? <><BadgeCheck aria-hidden="true" />Reviewed by {draft.reviewed.by}</> : draft.tidy === "tidied" ? "AI tidied · not yet reviewed" : draft.tidy === "by_hand" ? <><Pencil aria-hidden="true" />Written from the room’s bullets</> : "Tidying"}</span>
        <span className="grow" />{draft.lock && <span className="ovr-lock"><Lock aria-hidden="true" />{draft.lock.mine ? "You are editing" : `${draft.lock.by} is editing`}</span>}<StatusChip draft={draft} /></div>
      {draft.original_name !== draft.name && <div className="ovr-muted">The room called it “{draft.original_name}”. Renamed on Day 1 and kept.</div>}
      {other && <div className="ovr-banner" role="status" data-testid="ovn-locked"><Lock aria-hidden="true" /><div><strong>{other.by} is editing this outcome.</strong> You can read it. You can change it when they finish.</div></div>}
      {draft.tidy === "waiting" && <div className="ovr-banner" role="status"><History aria-hidden="true" /><div><strong>This outcome is still being tidied.</strong> It appears here as soon as the draft is ready. Write it by hand from the overview if you can’t wait.</div></div>}
      {live.length === 0 && draft.tidy !== "waiting" && <div className="ovr-empty is-warning" data-testid="ovn-thin-box"><TriangleAlert aria-hidden="true" /><div><strong>No bullets.</strong> Nothing the room typed, the scribe captured or the easel shows said what is true in {state.year}. It shows as thin on Day 2, so the room can fill it or rethink it. The draft doesn’t invent any.
        {!shut && <label className="ovr-check"><input type="checkbox" checked={Boolean(draft.thin_ack)} disabled={api.busy} onChange={e => void api.act({ action: "ack_thin", outcome: draft.id, value: e.target.checked })} />Show it in the morning as thin{draft.thin_ack ? ` (acknowledged by ${draft.thin_ack.by})` : ""}</label>}</div></div>}
      <div className={`ovr-bullets${other ? " is-locked" : ""}`} role="list" aria-label="3-year Vision bullets">
        {live.map((b, i) => { const m = markOf(b);
          return <div key={b.id} role="listitem" className={`ovr-bullet${b.id === selected?.id ? " is-selected" : ""}${b.flag ? " is-unsourced" : ""}`}>
            <button type="button" className="ovr-bullet-main" aria-pressed={b.id === selected?.id} onClick={() => { setSel(b.id); setTab("sources"); }} data-testid="ovn-bullet">
              <span className="txt">{b.text}</span>
              <span className={`ovr-mark${m.kind === "room" ? " is-room" : m.kind === "none" ? " is-none" : ""}`} title={m.kind === "none" ? "No source" : m.kind === "room" ? "The room’s own words" : `${m.n} sources`} data-testid="ovn-mark">
                {m.kind === "none" ? <TriangleAlert aria-label="No source" /> : <>{m.kind === "room" && <Quote aria-label="The room’s own words" />}{m.n}</>}</span></button>
            {edit?.id === b.id && <div className="ovr-edit"><textarea className="ovr-input" aria-label={`Edit bullet ${i + 1}`} value={edit.text} maxLength={280} rows={2} autoFocus onChange={e => setEdit({ id: b.id, text: e.target.value })} />
              <div className="ovr-row"><span className="ovr-muted">{280 - edit.text.length} left</span><span className="grow" /><button type="button" className="ovr-btn is-primary is-sm" disabled={!edit.text.trim() || api.busy} onClick={() => void save()}>Save the bullet</button><button type="button" className="ovr-btn is-sm" onClick={stopEdit}>Cancel</button></div></div>}
          </div>; })}
        {edit?.id === null && <div className="ovr-bullet is-selected"><div className="ovr-edit"><textarea className="ovr-input" aria-label="New bullet" placeholder="Write it in the present tense, as true in 3 years" value={edit.text} maxLength={280} rows={2} autoFocus onChange={e => setEdit({ id: null, text: e.target.value })} />
          <div className="ovr-row"><span className="ovr-muted">{280 - edit.text.length} left</span><span className="grow" /><button type="button" className="ovr-btn is-primary is-sm" disabled={!edit.text.trim() || api.busy} onClick={() => void save()}>Add the bullet</button><button type="button" className="ovr-btn is-sm" onClick={stopEdit}>Cancel</button></div></div></div>}
      </div>
      {selected && !edit && draft.tidy !== "waiting" && <div className="ovr-tools" data-testid="ovn-tools"><span className="lbl">Bullet {live.indexOf(selected) + 1}{selected.sources.length ? "" : " · no source"}{selected.flag === "number" ? " · number not in a card or photo" : ""}</span>
        <button type="button" className="ovr-btn is-sm" disabled={shut || api.busy} onClick={() => void startEdit(selected.id, selected.text)}><Pencil aria-hidden="true" />Edit</button>
        <button type="button" className="ovr-btn is-sm" disabled={shut || api.busy || !selected.restorable} onClick={() => void act({ action: "restore_words", bullet: selected.id })}><Quote aria-hidden="true" />{selected.restorable ? "Restore the room’s words" : selected.room_text !== null ? "The room’s words" : "No single source to restore"}</button>
        <button type="button" className="ovr-btn is-sm is-ghost" disabled={shut || api.busy} onClick={() => void act({ action: "remove", bullet: selected.id, removed: true })}><Trash2 aria-hidden="true" />Remove</button></div>}
      {!edit && draft.tidy !== "waiting" && <div className="ovr-row"><button type="button" className="ovr-btn is-sm" disabled={shut || api.busy} onClick={() => void startEdit(null, "")}><Plus aria-hidden="true" />Add a bullet</button>
        {removed.map(b => <button type="button" key={b.id} className="ovr-btn is-sm is-ghost" disabled={shut || api.busy} onClick={() => void act({ action: "remove", bullet: b.id, removed: false })}><Undo2 aria-hidden="true" />Put back “{b.text.slice(0, 40)}{b.text.length > 40 ? "…" : ""}”</button>)}</div>}
      {selected?.flag && !draft.reviewed && <div className="ovr-banner is-warning" role="status" data-testid="ovn-flag"><TriangleAlert aria-hidden="true" /><div><strong>{selected.flag === "none" ? `Bullet ${live.indexOf(selected) + 1} has no source.` : `Bullet ${live.indexOf(selected) + 1} has a number no scribe card or easel photo has.`}</strong> {selected.flag === "none" ? "Nothing the room typed, the scribe captured or the easel shows supports it. Add a source, rewrite it from the room’s words, or remove it before accepting the outcome." : "A number in a bullet comes from a scribe card or an easel photo, never from the AI. Add the source that has it, or take the number out."}</div></div>}
      {unusedRoom.length > 0 && draft.tidy !== "waiting" && <section className="ovr-note" data-testid="ovn-room-bullets"><h4>The room’s bullets not used yet</h4>
        {unusedRoom.map(b => <div key={b.id} className="ovr-row"><span className="txt">{b.text}</span><button type="button" className="ovr-btn is-sm" disabled={shut || api.busy} onClick={() => void act({ action: "add_room_bullet", indicator: b.id })}><Plus aria-hidden="true" />Add to the outcome</button></div>)}</section>}
      <div className="ovr-vt"><Notes title="Voices not to lose" icon={<Quote aria-hidden="true" />} notes={draft.voices} state={state} empty="No line stood out." /><Notes title="Tensions the room named" icon={<Zap aria-hidden="true" />} notes={draft.tensions} state={state} empty="The room named none." /></div>
      <div className="ovr-row is-between"><span className="ovr-muted">The number in a bullet comes from a scribe card or an easel photo, never from the AI.</span>
        {draft.reviewed ? <span className="ovr-st is-reviewed"><BadgeCheck aria-hidden="true" />Outcome reviewed</span>
          : <button type="button" className="ovr-btn is-confirm" disabled={Boolean(acceptBlock) || api.busy} title={acceptBlock} onClick={() => void act({ action: "accept" })} data-testid="ovn-accept"><BadgeCheck aria-hidden="true" />Accept the outcome</button>}</div>
      {acceptBlock && !draft.reviewed && <p className="ovr-muted" role="status">{acceptBlock}.</p>}
    </div>
    <aside className="ovr-pane ovr-src" aria-label="Sources and history">
      <div className="ovr-tabs" role="tablist"><button type="button" role="tab" aria-selected={tab === "sources"} onClick={() => setTab("sources")}>Sources</button><button type="button" role="tab" aria-selected={tab === "versions"} onClick={() => setTab("versions")}>Version history</button></div>
      {tab === "sources" && <div data-testid="ovn-sources">
        {selected ? <><div className="ovr-src-h">Sources for bullet {live.indexOf(selected) + 1}</div><div className="ovr-src-sent">{selected.text}</div>
          {selected.sources.length === 0 && <div className="ovr-banner is-warning"><TriangleAlert aria-hidden="true" /><div><strong>No source.</strong> No bullet, scribe card or easel photo supports this one.</div></div>}
          <div className="ovr-srclist">{selected.sources.map(s => <SourceCard key={s.id} state={state} draft={draft} source={s} engagement={engagement} locked={shut}
            onRemove={() => void act({ action: "source", bullet: selected.id, kind: s.kind, ref: s.ref, add: false })} />)}</div>
          {!shut && choices.length > 0 && <label className="ovr-field">Add a source<select className="ovr-input" value="" onChange={e => addSource(e.target.value)} data-testid="ovn-add-source"><option value="">Pick a bullet, card or photo</option>{choices.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>}
          {selected.room_text !== null && selected.restorable && <div className="ovr-muted">The room typed: “{selected.room_text}”</div>}
        </> : <p className="ovr-muted">Pick a bullet to see where its words came from.</p>}
      </div>}
      {tab === "versions" && <div className="ovr-ver" data-testid="ovn-versions"><div className="ovr-src-h">Every version of {draft.name}</div>
        {versions.map(v => <div key={v.n} className="v"><span className="n">{v.n}</span><div className="t"><b>{v.what}</b><span>{v.ai ? "AI" : v.by ?? "System"} · {stamp(v.at)}{v.current ? " · current" : ""}</span></div>
          {!v.current && v.kind !== "start" && <button type="button" className="ovr-btn is-sm" disabled={shut || api.busy} onClick={() => void act({ action: "restore_version", version: v.n })}><Undo2 aria-hidden="true" />Go back to this</button>}</div>)}</div>}
    </aside>
  </div>;
}

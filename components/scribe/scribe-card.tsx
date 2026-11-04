"use client";
import { useState } from "react";
import { Calendar, Camera, Check, CircleHelp, FileText, FolderInput, Gavel, Link2, Lock, MessageSquareText, Paperclip, Pencil, Quote, RefreshCw, ShieldCheck, SquareCheck, User, WifiOff, X, Zap } from "lucide-react";
import type { CardKind, ScribeSession } from "@/lib/scribe/types";
import { cleanDetail, kindInfo, canCapture, type ShownCard, type ShownFile } from "@/lib/scribe/policy";
import "./scribe.css";

const icons = { Quote, Gavel, Zap, SquareCheck, CircleHelp, ShieldCheck } as const;
export const time = (iso: string) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit" }).format(d) : ""; };

export function KindChip({ kind }: { kind: CardKind | "photo" | "file" }) {
  if (kind === "photo") return <span className="scr-kind"><Camera className="scr-icon" aria-hidden="true" /><span>Photo</span></span>;
  if (kind === "file") return <span className="scr-kind"><Paperclip className="scr-icon" aria-hidden="true" /><span>File</span></span>;
  const Icon = icons[kindInfo[kind].icon];
  return <span className="scr-kind"><Icon className="scr-icon" aria-hidden="true" /><span>{kindInfo[kind].label}</span></span>;
}
// Saved on this laptop, Syncing, Synced: the card never moves when its state changes.
export function StateChip({ state, device, show = "all" }: { state: ShownCard["state"]; device: "laptop" | "phone"; show?: "all" | "waiting" }) {
  if (state === "queued") return <span className="scr-chip"><WifiOff className="scr-icon" aria-hidden="true" />Saved on this {device}</span>;
  if (state === "syncing") return <span className="scr-chip is-syncing" role="status"><RefreshCw className="scr-icon" aria-hidden="true" />Syncing</span>;
  if (state === "failed") return <span className="scr-chip is-error"><X className="scr-icon" aria-hidden="true" />Didn’t save</span>;
  return show === "all" ? <span className="scr-chip"><Check className="scr-icon" aria-hidden="true" />Synced</span> : null;
}

const fileSize = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
export function fileUrl(engagement: string, id: string, surface: "scribe" | "control") { return `/api/scribe/${engagement}/files/${id}?surface=${surface}`; }

export type CardSurface = "console" | "phone" | "feed";
type CardProps = {
  card?: ShownCard; file?: ShownFile; engagement: string; surface: CardSurface; sessions?: ScribeSession[]; sessionTitle?: string; isNew?: boolean;
  onEdit?: (card: ShownCard, next: { text: string; detail: ReturnType<typeof cleanDetail>; speaker: string }) => void;
  onRefile?: (id: string, session: string) => void;
};

// ScribeCard: one capture. An icon and a word tell the kinds apart. The speaker is kept for the record
// and is never shown here: the card says only that one was kept, on the scribe's own console.
export function ScribeCard({ card, file, engagement, surface, sessions = [], sessionTitle, isNew, onEdit, onRefile }: CardProps) {
  const [mode, setMode] = useState<"view" | "edit" | "refile">("view");
  const [text, setText] = useState(card?.text ?? "");
  const [target, setTarget] = useState("");
  const device = surface === "phone" ? "phone" : "laptop";
  const item = card ?? file!;
  const kind: CardKind | "photo" | "file" = card ? card.kind : file!.kind;
  const state = item.state;
  const facts: React.ReactNode[] = [];
  if (card) {
    const d = card.detail;
    if (card.kind === "decision" && d.why) facts.push(<><MessageSquareText className="scr-icon" aria-hidden="true" />Why: {d.why}</>);
    if (card.kind === "action") {
      if (d.owner) facts.push(<><User className="scr-icon" aria-hidden="true" />{d.owner}</>); else facts.push(<><User className="scr-icon" aria-hidden="true" />No owner named</>);
      if (d.date) facts.push(<><Calendar className="scr-icon" aria-hidden="true" />{d.date}</>);
    }
    if (card.kind === "mitigation" && d.risk) facts.push(<><Link2 className="scr-icon" aria-hidden="true" />Linked to {d.risk}</>);
    if (card.has_speaker && surface !== "feed") facts.push(<><Lock className="scr-icon" aria-hidden="true" />Speaker kept for the record</>);
  }
  const editable = surface === "console" && card && !card.pending && state !== "queued";
  const meta = `${time(item.captured_at)}${sessionTitle && surface !== "console" ? ` · ${sessionTitle}` : ""}`;
  return <article className={`scr-card is-${kind}${state === "queued" ? " is-queued" : ""}${state === "failed" ? " is-failed" : ""}${isNew ? " is-new" : ""}`} aria-label={kind === "photo" ? "Photo" : kind === "file" ? "File" : kindInfo[kind].label} data-state={state}>
    <div className="scr-top">
      {item.order ? <span className="scr-order" aria-label={`Sends number ${item.order}`}>{item.order}</span> : null}
      <KindChip kind={kind} />
      <span className="scr-meta">{meta}</span>
      <span className="scr-state">
        {item.refiled ? <span className="scr-refiled"><FolderInput className="scr-icon" aria-hidden="true" />Re-filed</span> : null}
        {surface !== "feed" ? <StateChip state={state} device={device} /> : <StateChip state={state} device={device} show="waiting" />}
      </span>
      {surface === "console" && (card || file) && state !== "failed" && mode === "view" ? <span className="scr-acts">
        {editable ? <button type="button" className="scr-btn is-icon" aria-label="Edit this card" title="Edit" onClick={() => { setText(card!.text); setMode("edit"); }}><Pencil className="scr-icon" aria-hidden="true" /></button> : null}
        {state === "synced" && onRefile ? <button type="button" className="scr-btn is-icon" aria-label="Re-file to another session" title="Re-file to another session" onClick={() => { setTarget(""); setMode("refile"); }}><FolderInput className="scr-icon" aria-hidden="true" /></button> : null}
      </span> : null}
    </div>
    {card && mode !== "edit" ? <div className="scr-text">{card.kind === "quote" ? `“${card.text}”` : card.text}</div> : null}
    {card && card.kind === "tension" && card.detail.views && mode !== "edit" ? <div className="scr-views"><div><b>One view</b>{card.detail.views[0]}</div><div><b>The other view</b>{card.detail.views[1]}</div></div> : null}
    {card && mode === "edit" ? <div className="scr-edit">
      <label className="scr-flabel" htmlFor={`edit-${card.id}`}>{kindInfo[card.kind].field}</label>
      <textarea id={`edit-${card.id}`} className="scr-input" value={text} onChange={e => setText(e.target.value)} aria-invalid={!canCapture(text)} />
      <div className="scr-row"><button type="button" className="scr-btn is-sm" onClick={() => setMode("view")}>Cancel</button>
        <button type="button" className="scr-btn is-sm is-primary" disabled={!canCapture(text)} onClick={() => { onEdit?.(card, { text: text.trim(), detail: cleanDetail(card.kind, card.detail as Record<string, unknown>), speaker: "" }); setMode("view"); }}>Save the edit</button></div>
    </div> : null}
    {file && file.kind === "photo" ? (file.uploaded ? <span className="scr-photo">
      {/* eslint-disable-next-line @next/next/no-img-element -- served by our own signed-in route, never optimised by a CDN */}
      <img src={fileUrl(engagement, file.id, surface === "feed" ? "control" : "scribe")} alt={`Easel photo, ${file.name}`} loading="lazy" /></span>
      : <span className="scr-photo is-waiting">{file.name}</span>) : null}
    {file && file.kind === "file" ? <div className="scr-file"><FileText className="scr-icon" aria-hidden="true" />{file.uploaded
      ? <a href={fileUrl(engagement, file.id, surface === "feed" ? "control" : "scribe")} download={file.name}>{file.name}</a> : <span className="scr-trunc">{file.name}</span>}<small>{fileSize(file.bytes)}</small></div> : null}
    {facts.length ? <div className="scr-facts">{facts.map((f, i) => <span key={i}>{f}</span>)}</div> : null}
    {item.reason ? <div className="scr-err" role="alert">{item.reason}</div> : null}
    {mode === "refile" ? <div className="scr-refile">
      <select aria-label="Re-file to" value={target} onChange={e => setTarget(e.target.value)}><option value="">Pick a session</option>
        {sessions.filter(s => s.id !== item.session_id && !s.team_led).map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
      <button type="button" className="scr-btn is-sm is-primary" disabled={!target} onClick={() => { onRefile?.(item.id, target); setMode("view"); }}>Re-file</button>
      <button type="button" className="scr-btn is-sm" onClick={() => setMode("view")}>Cancel</button>
    </div> : null}
  </article>;
}

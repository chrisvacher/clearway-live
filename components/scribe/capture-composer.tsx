"use client";
import { useEffect, useRef, useState } from "react";
import { CircleAlert, CornerDownLeft, Link2, Lock, Paperclip, Quote, Gavel, Zap, SquareCheck, CircleHelp, ShieldCheck } from "lucide-react";
import { cardKinds, type CardDetail, type CardKind } from "@/lib/scribe/types";
import { canCapture, checkCapture, cleanDetail, fileAccept, kindForKey, kindInfo } from "@/lib/scribe/policy";
import "./scribe.css";

const icons = { Quote, Gavel, Zap, SquareCheck, CircleHelp, ShieldCheck } as const;
export type CaptureInput = { kind: CardKind; text: string; detail: CardDetail; speaker: string };
type Props = { sessionTitle: string | null; off?: boolean; onCapture: (input: CaptureInput) => void; onFiles: (files: File[]) => void; fileError?: string };

// CaptureComposer: pick a kind by key, type, add a speaker for the record, Enter. The session it
// attaches to is the one the room is on, and the composer says which.
export function CaptureComposer({ sessionTitle, off = false, onCapture, onFiles, fileError }: Props) {
  const [kind, setKind] = useState<CardKind>("quote");
  const [text, setText] = useState("");
  const [who, setWho] = useState("");
  const [extra, setExtra] = useState<{ view1: string; view2: string; owner: string; date: string; why: string; risk: string }>({ view1: "", view2: "", owner: "", date: "", why: "", risk: "" });
  const area = useRef<HTMLTextAreaElement>(null), picker = useRef<HTMLInputElement>(null);
  const disabled = off || !sessionTitle;
  const problem = checkCapture(text);

  function clear() { setText(""); setWho(""); setExtra({ view1: "", view2: "", owner: "", date: "", why: "", risk: "" }); }
  function send() {
    if (disabled || !canCapture(text)) return;
    const detail = cleanDetail(kind, { views: [extra.view1, extra.view2], owner: extra.owner, date: extra.date, why: extra.why, risk: extra.risk });
    onCapture({ kind, text: text.trim(), detail, speaker: who.trim() });
    clear(); area.current?.focus();
  }
  function pick(next: CardKind) { setKind(next); area.current?.focus(); }

  // Keys 1 to 6 pick a kind when no field has focus (Ctrl or Command with a digit works while typing); U uploads.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (disabled || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
      const chosen = kindForKey(event.key);
      if (chosen && ((!typing && !event.ctrlKey && !event.metaKey) || ((event.ctrlKey || event.metaKey) && !event.shiftKey))) { event.preventDefault(); pick(chosen); return; }
      if (!typing && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "u") { event.preventDefault(); picker.current?.click(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const field = (id: string, label: string, value: string, set: (v: string) => void, placeholder = "") => <div className="scr-field"><label className="scr-flabel" htmlFor={id}>{label}</label>
    <input id={id} className="scr-input" value={value} placeholder={placeholder} disabled={disabled} onChange={e => set(e.target.value)} /></div>;
  return <div className="scr-comp" data-kind={kind}>
    <span className="scr-eyebrow">Capture</span>
    <div className="scr-kinds" role="group" aria-label="Card kind">
      {cardKinds.map(k => { const Icon = icons[kindInfo[k].icon]; return <button key={k} type="button" className="scr-tag" aria-pressed={k === kind && !disabled} aria-keyshortcuts={kindInfo[k].key} disabled={disabled} onClick={() => pick(k)}>
        <Icon className="scr-icon" aria-hidden="true" />{kindInfo[k].label}<span className="scr-kbd">{kindInfo[k].key}</span></button>; })}
    </div>
    <div className="scr-field">
      <label className="scr-flabel" htmlFor="scr-text">{kindInfo[kind].field}</label>
      <textarea id="scr-text" ref={area} className="scr-input" value={text} disabled={disabled} aria-invalid={Boolean(problem)} aria-describedby={problem ? "scr-text-err" : undefined}
        placeholder="Type, pick a kind with 1 to 6, Enter to capture" onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } else if (e.key === "Escape") { e.preventDefault(); clear(); } }} />
      {problem ? <span id="scr-text-err" className="scr-err"><CircleAlert className="scr-icon" aria-hidden="true" />{problem}</span> : null}
    </div>
    {kind === "tension" ? <div className="scr-two">{field("scr-view1", "One view", extra.view1, v => setExtra({ ...extra, view1: v }))}{field("scr-view2", "The other view", extra.view2, v => setExtra({ ...extra, view2: v }))}</div> : null}
    {kind === "action" ? <div className="scr-two">{field("scr-owner", "Owner, if named", extra.owner, v => setExtra({ ...extra, owner: v }))}{field("scr-date", "Date, if named", extra.date, v => setExtra({ ...extra, date: v }))}</div> : null}
    {kind === "decision" ? field("scr-why", "Why, if said", extra.why, v => setExtra({ ...extra, why: v })) : null}
    {kind === "mitigation" ? field("scr-risk", "The risk it answers", extra.risk, v => setExtra({ ...extra, risk: v }), "Name the risk from the pre-mortem") : null}
    <div className="scr-field">
      <label className="scr-flabel" htmlFor="scr-who">Who said it</label>
      <input id="scr-who" className="scr-input" value={who} placeholder="Optional" disabled={disabled} onChange={e => setWho(e.target.value)} />
      <span className="scr-record"><Lock className="scr-icon" aria-hidden="true" />For the record only. Never on the TV, phones or the read-back.</span>
    </div>
    <div className="scr-attach" title={sessionTitle ?? ""}><Link2 className="scr-icon" aria-hidden="true" /><span>Attaches to {sessionTitle ?? "Nothing live"}</span></div>
    <div className="scr-row">
      <button type="button" className="scr-btn is-sm is-ghost" disabled={disabled} onClick={() => picker.current?.click()}><Paperclip className="scr-icon" aria-hidden="true" />Upload a file</button>
      <button type="button" className="scr-btn is-primary" disabled={disabled || !canCapture(text)} onClick={send}><CornerDownLeft className="scr-icon" aria-hidden="true" />Capture</button>
    </div>
    <input ref={picker} type="file" multiple hidden accept={fileAccept} aria-label="Choose files to upload" onChange={e => { const list = [...(e.target.files ?? [])]; e.target.value = ""; if (list.length) onFiles(list); }} />
    {fileError ? <span className="scr-err" role="alert"><CircleAlert className="scr-icon" aria-hidden="true" />{fileError}</span> : null}
    <div className="scr-keys"><span><span className="scr-kbd">1</span> to <span className="scr-kbd">6</span> kind</span><span><span className="scr-kbd">Enter</span> capture</span><span><span className="scr-kbd">U</span> upload</span><span><span className="scr-kbd">Esc</span> clear</span></div>
  </div>;
}

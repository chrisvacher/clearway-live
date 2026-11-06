"use client";
import { useRef, useState, type DragEvent } from "react";
import { CircleAlert, Check, ClipboardPaste, File, FileText, FileType, LoaderCircle, Lock, Trash2, Upload } from "lucide-react";
import type { Note } from "@/lib/discover/types";
import { MAX_FILE_BYTES, MAX_NOTE_CHARS, MAX_PERSON, MAX_TITLE, cleanNoteText, fileSource, noteKindHint, noteKindLabel, noteKinds, titleFromFileName, type NoteKind } from "@/lib/discover/policy";
import type { Reply } from "./use-discover";

type Send = (body: Record<string, unknown>) => Promise<Reply>;
type Attempt = { key: string; name: string; state: "reading" | "unreadable"; reason?: string };
const icon = (n: Note) => n.source_kind === "pdf" ? FileText : n.source_kind === "docx" ? FileType : n.source_kind === "paste" ? ClipboardPaste : File;
const words = (n: number) => `${n.toLocaleString("en-CA")} ${n === 1 ? "word" : "words"}`;

function NoteRow({ note, send, closed }: { note: Note; send: Send; closed: boolean }) {
  const [open, setOpen] = useState(false), [title, setTitle] = useState(note.title), [person, setPerson] = useState(note.person || ""), [kind, setKind] = useState<NoteKind>(note.kind);
  const [busy, setBusy] = useState(false), [say, setSay] = useState("");
  const Icon = icon(note);
  async function update(next: { kind?: NoteKind; title?: string; person?: string }) {
    setBusy(true);
    const reply = await send({ action: "note_update", id: note.id, kind: next.kind ?? kind, title: next.title ?? title, person: next.person ?? person });
    setBusy(false); setSay(reply.status === "ok" ? "Saved." : reply.message || "We couldn't save that. Try again.");
  }
  async function remove() { setBusy(true); const reply = await send({ action: "note_delete", id: note.id }); setBusy(false); if (reply.status !== "ok") setSay(reply.message || "We couldn't remove that. Try again."); }
  return <div className="dsc-file">
    <span className="fi"><Icon aria-hidden="true" /></span>
    <div className="t"><b title={note.title}>{note.title}</b>
      <select className="dsc-select is-sm" aria-label={`Which conversation: ${note.title}`} value={kind} disabled={busy || closed} onChange={e => { const k = e.target.value as NoteKind; setKind(k); void update({ kind: k }); }}>
        {noteKinds.map(k => <option key={k} value={k}>{noteKindLabel[k]}</option>)}</select>
      <button className="dsc-btn is-ghost is-compact" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide details" : "Show details"}</button>
    </div>
    <span className="st"><Check aria-hidden="true" />{words(note.word_count)}</span>
    {open ? <div className="more">
      <div className="dsc-row">
        <div className="dsc-field is-grow"><label htmlFor={`n-title-${note.id}`}>Title</label><input id={`n-title-${note.id}`} className="dsc-input" maxLength={MAX_TITLE} value={title} onChange={e => setTitle(e.target.value)} disabled={closed} /></div>
        <div className="dsc-field is-grow"><label htmlFor={`n-person-${note.id}`}>Person (for the record only)</label><input id={`n-person-${note.id}`} className="dsc-input" maxLength={MAX_PERSON} value={person} onChange={e => setPerson(e.target.value)} disabled={closed} /></div>
        <button className="dsc-btn" type="button" disabled={busy || closed || !title.trim() || (title === note.title && person === (note.person || ""))} onClick={() => update({})}>Save details</button>
        <button className="dsc-btn is-ghost" type="button" disabled={busy || closed} onClick={remove} aria-label={`Remove ${note.title}`}><Trash2 aria-hidden="true" />Remove</button>
      </div>
      <span className="dsc-muted">{note.char_count.toLocaleString("en-CA")} characters. The person is never sent to AI and never appears in a theme or a quote.</span>
    </div> : null}
    {say ? <p className="dsc-status is-wide" role="status">{say}</p> : null}
  </div>;
}

// NotesUpload (SET-06): paste, Word, PDF or text. The text is read on the server and the file is not kept.
export function NotesUpload({ engagement, notes, send, refresh, closed, governance }: { engagement: string; notes: Note[]; send: Send; refresh: () => Promise<void>; closed: boolean; governance: string }) {
  const [kind, setKind] = useState<NoteKind>("interview"), [person, setPerson] = useState(""), [title, setTitle] = useState(""), [text, setText] = useState("");
  const [attempts, setAttempts] = useState<Attempt[]>([]), [over, setOver] = useState(false), [busy, setBusy] = useState(false), [say, setSay] = useState<{ text: string; err: boolean }>({ text: "", err: false });
  const input = useRef<HTMLInputElement>(null);
  const interviews = notes.filter(n => n.kind === "interview").length, inputs = notes.length - interviews;
  const clean = cleanNoteText(text);

  async function paste() {
    if (!title.trim()) return setSay({ text: "Give the notes a title.", err: true });
    if (!clean) return setSay({ text: "Paste the notes first.", err: true });
    if (clean.length > MAX_NOTE_CHARS) return setSay({ text: `A note can hold ${MAX_NOTE_CHARS.toLocaleString("en-CA")} characters. Split it into two notes.`, err: true });
    setBusy(true); const reply = await send({ action: "note_add", id: crypto.randomUUID(), kind, person, title, text: clean }); setBusy(false);
    if (reply.status === "ok" || reply.status === "duplicate") { setText(""); setTitle(""); setPerson(""); setSay({ text: "Added.", err: false }); } else setSay({ text: reply.message || "We couldn't save that. Try again.", err: true });
  }

  async function addFile(file: File) {
    const key = crypto.randomUUID();
    const bad = (reason: string) => setAttempts(a => [{ key, name: file.name, state: "unreadable", reason }, ...a.filter(x => x.key !== key)]);
    if (!fileSource(file.name)) return bad("Use a Word (.docx), PDF or text (.txt) file, or paste the text.");
    if (file.size > MAX_FILE_BYTES) return bad("That file is larger than 4 MB. Paste the text instead.");
    if (file.size === 0) return bad("That file is empty.");
    setAttempts(a => [{ key, name: file.name, state: "reading" }, ...a]);
    try {
      const form = new FormData(); form.set("file", file); form.set("id", crypto.randomUUID()); form.set("kind", kind); form.set("person", person); form.set("title", titleFromFileName(file.name));
      const response = await fetch(`/api/discover/${engagement}/file`, { method: "POST", body: form });
      const data = await response.json().catch(() => ({} as Reply));
      if (response.status === 413) return bad("That file is too large to upload here. Paste the text, or save a smaller copy.");
      if (data.status === "ok" || data.status === "duplicate") { setAttempts(a => a.filter(x => x.key !== key)); await refresh(); return; }
      bad(data.message || "We couldn't read that file. Paste the text instead.");
    } catch { bad("We couldn't connect just now. Try again."); }
  }
  function pick(files: FileList | null) { if (files) for (const f of Array.from(files).slice(0, 10)) void addFile(f); if (input.current) input.current.value = ""; }
  function drop(event: DragEvent) { event.preventDefault(); setOver(false); if (!closed) pick(event.dataTransfer.files); }

  return <section className="dsc-part" aria-label="Interviews and input conversations">
    <div className="dsc-card">
      <div className="dsc-row">
        <div className="dsc-field is-grow"><label htmlFor="dsc-kind">Which conversation is next</label>
          <select id="dsc-kind" className="dsc-select" value={kind} onChange={e => setKind(e.target.value as NoteKind)} disabled={closed}>{noteKinds.map(k => <option key={k} value={k}>{noteKindLabel[k]} ({noteKindHint(governance)[k].toLowerCase()})</option>)}</select></div>
        <div className="dsc-field is-grow"><label htmlFor="dsc-person">Person (for the record only)</label>
          <input id="dsc-person" className="dsc-input" maxLength={MAX_PERSON} autoComplete="off" value={person} onChange={e => setPerson(e.target.value)} disabled={closed} /></div>
      </div>
      <div className={`dsc-drop${over ? " is-over" : ""}`} onDragOver={e => { e.preventDefault(); if (!closed) setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
        <Upload aria-hidden="true" /><div><b>Drop notes or transcripts here</b><span>Word, PDF or text, up to 4 MB. The file is read and not kept.</span></div>
        <button className="dsc-btn" type="button" disabled={closed} onClick={() => input.current?.click()}>Choose files</button>
        <input ref={input} type="file" hidden multiple accept=".docx,.pdf,.txt" aria-label="Choose note files" onChange={e => pick(e.target.files)} />
      </div>
      <div className="dsc-field"><label htmlFor="dsc-title">Or paste notes: title</label>
        <input id="dsc-title" className="dsc-input" maxLength={MAX_TITLE} autoComplete="off" placeholder="Interview with the lead pastor" value={title} onChange={e => setTitle(e.target.value)} disabled={closed} /></div>
      <div className="dsc-field"><label htmlFor="dsc-text">Notes</label>
        <textarea id="dsc-text" className="dsc-text" value={text} onChange={e => setText(e.target.value)} disabled={closed} /></div>
      <div className="dsc-row is-between"><span className="dsc-muted">{clean.length.toLocaleString("en-CA")} of {MAX_NOTE_CHARS.toLocaleString("en-CA")} characters</span>
        <button className="dsc-btn is-primary" type="button" onClick={paste} disabled={busy || closed || !clean || clean.length > MAX_NOTE_CHARS}><ClipboardPaste aria-hidden="true" />Add pasted notes</button></div>
      <p className={`dsc-status${say.text ? (say.err ? " is-err" : " is-ok") : ""}`} role="status" aria-live="polite">{say.text}</p>
    </div>
    <div className="dsc-row is-between"><span className="dsc-muted">{interviews} {interviews === 1 ? "interview" : "interviews"} and {inputs} input {inputs === 1 ? "conversation" : "conversations"}</span></div>
    <div className="dsc-files">
      {attempts.map(a => <div key={a.key} className={`dsc-file${a.state === "unreadable" ? " is-err" : ""}`}>
        <span className="fi"><File aria-hidden="true" /></span>
        <div className="t"><b title={a.name}>{a.name}</b>{a.reason ? <span className="why">{a.reason}</span> : null}</div>
        {a.state === "reading" ? <span className="st"><LoaderCircle aria-hidden="true" />Reading</span>
          : <span className="st is-err"><CircleAlert aria-hidden="true" />Couldn&apos;t read it <button className="dsc-btn is-ghost is-compact" type="button" onClick={() => setAttempts(x => x.filter(y => y.key !== a.key))}>Dismiss</button></span>}
      </div>)}
      {notes.map(n => <NoteRow key={n.id} note={n} send={send} closed={closed} />)}
    </div>
    <div className="dsc-note"><Lock aria-hidden="true" /><span>Notes stay with Clearway. Only themes without names reach the report or the room.</span></div>
  </section>;
}

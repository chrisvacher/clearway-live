"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Finding } from "@/lib/discover/types";
import { MAX_FIGURE, MAX_FINDING_TITLE, findingInput } from "@/lib/discover/policy";
import { thin } from "@/lib/discover/thin";
import { ThinFlag } from "./thin-flag";
import type { Reply } from "./use-discover";

type Send = (body: Record<string, unknown>) => Promise<Reply>;
type Say = { text: string; kind: "ok" | "err" | "" };

function useSay(): [Say, (reply: Reply, ok: string) => void, (text: string) => void] {
  const [say, set] = useState<Say>({ text: "", kind: "" });
  return [say, (reply, ok) => set(reply.status === "ok" || reply.status === "duplicate" ? { text: ok, kind: "ok" } : { text: reply.message || "We couldn't save that. Try again.", kind: "err" }), text => set({ text, kind: "err" })];
}
const Status = ({ say }: { say: Say }) => <p className={`dsc-status${say.kind ? ` is-${say.kind}` : ""}`} role="status" aria-live="polite">{say.text}</p>;

// The survey&apos;s total respondents, once per engagement. Thin data is worked out against it.
export function SurveyTotal({ total, send, closed }: { total: number | null; send: Send; closed: boolean }) {
  const [value, setValue] = useState(total === null ? "" : String(total)); const [seen, setSeen] = useState(total); const [busy, setBusy] = useState(false); const [say, ok, bad] = useSay();
  if (seen !== total) { setSeen(total); setValue(total === null ? "" : String(total)); }
  const changed = value.trim() !== (total === null ? "" : String(total));
  async function save() {
    const t = value.trim();
    if (t && !/^\d{1,7}$/.test(t)) return bad("Say how many people answered the survey, as a whole number.");
    setBusy(true); const reply = await send({ action: "total", total: t ? Number(t) : null }); setBusy(false); ok(reply, t ? "Saved." : "Cleared.");
  }
  return <div className="dsc-card"><div className="dsc-row">
    <div className="dsc-field is-count"><label htmlFor="dsc-total">People who answered</label>
      <input id="dsc-total" className="dsc-input" inputMode="numeric" autoComplete="off" value={value} onChange={e => setValue(e.target.value)} disabled={closed} /></div>
    <button className="dsc-btn" type="button" onClick={save} disabled={busy || closed || !changed}>Save total</button>
  </div>
  <span className="dsc-muted">The survey&apos;s total respondents, from the top of the report in Team Hub. It is used to work out thin data.</span><Status say={say} /></div>;
}

function FindingRow({ finding, total, send, closed }: { finding?: Finding; total: number | null; send: Send; closed: boolean }) {
  const fresh = !finding;
  const [id, setId] = useState(() => finding?.id || crypto.randomUUID());
  const [title, setTitle] = useState(finding?.title || ""), [figure, setFigure] = useState(finding?.figure || ""), [rests, setRests] = useState(finding ? String(finding.rests_on) : "");
  const [busy, setBusy] = useState(false); const [say, ok, bad] = useSay();
  const changed = fresh || title !== finding.title || figure !== finding.figure || rests !== String(finding.rests_on);
  const parsed = findingInput({ title, figure, rests_on: rests });
  const flag = finding ? thin({ source: "survey", restsOn: finding.rests_on, outOf: total }) : null;
  async function save() {
    if (!parsed.ok) return bad(parsed.message);
    setBusy(true); const reply = await send({ action: "finding_save", id, title: parsed.title, figure: parsed.figure, rests_on: parsed.restsOn }); setBusy(false);
    ok(reply, fresh ? "Added. It is now a theme." : "Saved.");
    if (fresh && (reply.status === "ok" || reply.status === "duplicate")) { setTitle(""); setFigure(""); setRests(""); setId(crypto.randomUUID()); }
  }
  async function remove() {
    if (!finding) return;
    setBusy(true); const reply = await send({ action: "finding_delete", id: finding.id }); setBusy(false); ok(reply, "Removed.");
  }
  const key = finding?.id || "new";
  return <li className="dsc-card dsc-finding">
    <div className="dsc-row">
      <div className="dsc-field is-grow"><label htmlFor={`f-title-${key}`}>Finding</label>
        <input id={`f-title-${key}`} className="dsc-input" maxLength={MAX_FINDING_TITLE + 40} placeholder="Welcoming culture" value={title} onChange={e => setTitle(e.target.value)} disabled={closed} /></div>
      <div className="dsc-field is-figure"><label htmlFor={`f-figure-${key}`}>Number in the report</label>
        <input id={`f-figure-${key}`} className="dsc-input" maxLength={MAX_FIGURE + 20} placeholder="72%" value={figure} onChange={e => setFigure(e.target.value)} disabled={closed} /></div>
      <div className="dsc-field is-count"><label htmlFor={`f-rests-${key}`}>Respondents it rests on</label>
        <input id={`f-rests-${key}`} className="dsc-input" inputMode="numeric" autoComplete="off" placeholder="60" value={rests} onChange={e => setRests(e.target.value)} disabled={closed} /></div>
      <button className="dsc-btn is-primary" type="button" onClick={save} disabled={busy || closed || !changed}>{fresh ? <><Plus aria-hidden="true" />Add finding</> : "Save finding"}</button>
      {finding ? <button className="dsc-btn is-ghost" type="button" onClick={remove} disabled={busy || closed} aria-label={`Remove ${finding.title}`}><Trash2 aria-hidden="true" />Remove</button> : null}
    </div>
    {flag?.thin ? <ThinFlag reason={flag.reason} /> : null}
    <Status say={say} />
  </li>;
}

export function Findings({ findings, total, send, closed }: { findings: Finding[]; total: number | null; send: Send; closed: boolean }) {
  return <ul className="dsc-list" aria-label="Survey findings">
    {findings.map(f => <FindingRow key={f.id} finding={f} total={total} send={send} closed={closed} />)}
    <FindingRow key="new" total={total} send={send} closed={closed} />
  </ul>;
}

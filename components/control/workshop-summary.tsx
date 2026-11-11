"use client";
import { useEffect, useState } from "react";
import { Download, Pencil } from "lucide-react";
import { AiIcon, AiMark } from "@/components/interactions/ai/ai-icon";
import { SUMMARY_MAX, paragraphsOf, summaryMessage, type SummaryState } from "@/lib/workshop/summary";

// After the workshop: the short summary. AI drafts it from the room's answers when the facilitator asks, and the facilitator edits it.
// If the summary's functions are not in the database yet, the card is left out.
export function WorkshopSummary({ engagement, answers }: { engagement: string; answers: boolean }) {
  const [state, setState] = useState<SummaryState | null>(null), [busy, setBusy] = useState<"draft" | "save" | "clear" | null>(null);
  const [message, setMessage] = useState(""), [editing, setEditing] = useState(false), [text, setText] = useState("");
  const url = `/api/control/${engagement}/summary`;
  useEffect(() => {
    let stop = false;
    void fetch(url, { cache: "no-store" }).then(r => r.json()).then((d: SummaryState) => { if (!stop && d.status === "ok") setState(d); }).catch(() => {});
    return () => { stop = true; };
  }, [url]);
  if (!state) return null;
  const summary = state.summary;
  async function send(action: "draft" | "save" | "clear", body?: string) {
    setBusy(action); setMessage("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, body }) });
      const data = await response.json() as SummaryState & { message?: string };
      if (response.ok && data.status === "ok") { setState(data); setEditing(false); }
      else setMessage(data.message ?? summaryMessage(String(data.status)));
    } catch { setMessage(summaryMessage("unavailable")); }
    setBusy(null);
  }
  const draft = () => { if (!summary || summary.source === "ai" || window.confirm("Draft again? This replaces the summary, including your edits.")) void send("draft"); };
  return <section className="ws-card" aria-labelledby="ws-title" data-testid="workshop-summary">
    <div className="ws-head"><h2 id="ws-title">Summary</h2>
      {!editing && <div className="ctl-row ws-actions">
        {summary && <button className="show-button is-small" type="button" disabled={Boolean(busy)} onClick={() => { setText(summary.body); setEditing(true); setMessage(""); }}><Pencil size={14} aria-hidden="true" />Edit</button>}
        {state.ai && answers && <button className={`show-button is-small${summary ? "" : " is-primary"}`} type="button" disabled={Boolean(busy)} onClick={draft}><AiIcon size={14} />{busy === "draft" ? "Drafting" : summary ? "Draft again" : "Draft a summary"}</button>}
        {!summary && <button className="show-button is-small" type="button" disabled={Boolean(busy)} onClick={() => { setText(""); setEditing(true); setMessage(""); }}><Pencil size={14} aria-hidden="true" />Write it yourself</button>}
        {summary && <a className="show-button is-small" href={`${url}?format=docx`} download><Download size={14} aria-hidden="true" />Download as Word</a>}
      </div>}
    </div>
    {summary?.source === "ai" && !editing && <p className="ws-note"><AiMark label="AI" />AI drafted this from the room&rsquo;s answers. Read it before you share it.</p>}
    {message && <p className="show-message is-error ws-message" role="alert">{message}</p>}
    {busy === "draft" && <p className="ws-note" role="status">Reading the room&rsquo;s answers. This takes up to a minute.</p>}
    {editing ? <form className="ws-form" onSubmit={e => { e.preventDefault(); void send("save", text); }}>
      <label htmlFor="ws-text">Summary</label>
      <textarea id="ws-text" rows={10} maxLength={SUMMARY_MAX} value={text} onChange={e => setText(e.target.value)} />
      <p className="show-help">Leave a blank line between paragraphs.</p>
      <div className="ctl-row">
        <button className="show-button is-primary is-small" type="submit" disabled={Boolean(busy) || !text.trim()}>{busy === "save" ? "Saving" : "Save summary"}</button>
        <button className="show-button is-small" type="button" disabled={Boolean(busy)} onClick={() => setEditing(false)}>Cancel</button>
        {summary && <button className="show-button is-small" type="button" disabled={Boolean(busy)} onClick={() => { if (window.confirm("Remove the summary?")) void send("clear"); }}>Remove summary</button>}
      </div>
    </form>
      : summary ? <div className="ws-body">{paragraphsOf(summary.body).map((p, i) => <p key={i}>{p}</p>)}</div>
      : <p className="ws-empty">{!answers ? "Once the room has answered, you can draft a short summary of what it said here." : state.ai ? "Draft a short summary of what the room said, then edit it before you share it." : "AI is off for this engagement, so there is no draft. You can write the summary yourself."}</p>}
  </section>;
}

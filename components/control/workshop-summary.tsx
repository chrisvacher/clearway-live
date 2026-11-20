"use client";
import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { AiIcon } from "@/components/interactions/ai/ai-icon";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SUMMARY_MAX, paragraphsOf, summaryMessage, type SummaryState } from "@/lib/workshop/summary";

export function WorkshopSummary({ engagement, answers, onAvailability }: {
  engagement: string;
  answers: boolean;
  onAvailability: (available: boolean) => void;
}) {
  const [state, setState] = useState<SummaryState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"draft" | "save" | "clear" | null>(null);
  const [confirm, setConfirm] = useState<"draft" | "clear" | null>(null);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const url = `/api/control/${engagement}/summary`;
  useEffect(() => {
    const controller = new AbortController();
    void fetch(url, { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json() as SummaryState;
      if (controller.signal.aborted) return;
      if (result.status === "ok") {
        setState(result);
        onAvailability(Boolean(result.summary));
      }
    }).catch(() => {}).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [onAvailability, url]);

  if (loading) return <section className="ws-card cwl-g-summary" aria-label="Loading summary" aria-busy="true">
    <div className="cwl-g-skeleton" aria-hidden="true"><span /><span /><span /></div>
  </section>;
  if (!state) return null;
  const summary = state.summary;
  const byline = summary?.drafted_at ? "Drafted by AI from the answers, then edited by you" : summary ? "Written by you" : null;
  async function send(action: "draft" | "save" | "clear", body?: string) {
    setBusy(action);
    setConfirm(null);
    setMessage("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, body }) });
      const data = await response.json() as SummaryState & { message?: string };
      if (response.ok && data.status === "ok") {
        setState(data);
        setEditing(false);
        onAvailability(Boolean(data.summary));
      } else setMessage(data.message ?? summaryMessage(String(data.status)));
    } catch { setMessage(summaryMessage("unavailable")); }
    finally { setBusy(null); }
  }
  return <section className="ws-card cwl-g-summary" aria-labelledby="ws-title" data-testid="workshop-summary">
    <div className="ws-head">
      <div className="cwl-g-summary-name"><AiIcon size={20} /><div><h2 id="ws-title">Summary</h2>{byline && <p className="ws-note">{byline}</p>}</div></div>
      {!editing && <div className="ctl-row ws-actions">
        <Button size="small" disabled={Boolean(busy)} onClick={() => { setText(summary?.body ?? ""); setEditing(true); setMessage(""); }}>
          <Pencil aria-hidden="true" />{summary ? "Edit" : "Write it yourself"}
        </Button>
        {state.ai && answers && <Button size="small" disabled={Boolean(busy)} onClick={() => {
          if (summary?.source === "edited") setConfirm("draft");
          else void send("draft");
        }}>{busy === "draft" ? "Drafting" : summary ? "Draft again" : "Draft a summary"}</Button>}
      </div>}
    </div>
    {message && <p className="show-message is-error ws-message" role="alert">{message}</p>}
    {busy === "draft" && <p className="ws-note" role="status">Reading the room&rsquo;s answers. This takes up to a minute.</p>}
    {editing ? <form className="ws-form" onSubmit={event => { event.preventDefault(); void send("save", text); }}>
      <label htmlFor="ws-text">Summary</label>
      <textarea id="ws-text" rows={10} maxLength={SUMMARY_MAX} value={text} onChange={event => setText(event.target.value)} />
      <p className="show-help">Leave a blank line between paragraphs.</p>
      <div className="ctl-row">
        <Button variant="primary" size="small" type="submit" disabled={Boolean(busy) || !text.trim()}>{busy === "save" ? "Saving" : "Save summary"}</Button>
        <Button size="small" disabled={Boolean(busy)} onClick={() => setEditing(false)}>Cancel</Button>
        {summary && <Button variant="quiet" size="small" disabled={Boolean(busy)} onClick={() => setConfirm("clear")}>Remove summary</Button>}
      </div>
    </form>
      : summary ? <div className="ws-body">{paragraphsOf(summary.body).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
      : <p className="ws-empty">{!answers ? "Once the room has answered, you can draft a short summary of what it said here." : state.ai ? "Draft a short summary of what the room said, then edit it before you share it." : "AI is off for this engagement. You can write the summary yourself."}</p>}
    <ConfirmDialog open={Boolean(confirm)} title={confirm === "draft" ? "Draft again?" : "Remove the summary?"}
      description={confirm === "draft" ? "This replaces the summary, including your edits." : "The session results stay available."}
      confirmLabel={confirm === "draft" ? "Draft again" : "Remove summary"} onCancel={() => setConfirm(null)}
      onConfirm={() => { if (confirm) void send(confirm); }} />
  </section>;
}

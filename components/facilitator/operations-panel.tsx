"use client";
import { useCallback, useEffect, useState } from "react";
import { reportClientError } from "@/lib/operations/client";
type State = {
  eligible_files: number; protected_files: number; protected_bytes: number; pending: number;
  last_run: { status: string; finished_at: string | null } | null; last_recovery_check: string | null;
  last_alert: { sent_at: string | null } | null;
  errors: { id: string; event: { kind: string; name: string; route: string; frames: string[] }; release: string; occurrences: number; last_seen: string }[];
  backups: { id: string; name: string; bytes: number; sha256: string; completed_at: string; probe: boolean }[];
};
const when = (value: string | null | undefined) => value ? new Date(value).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "Not recorded yet";
export function OperationsPanel() {
  const [state, setState] = useState<State | null>(null), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/operations", { cache: "no-store" }), data = await r.json();
      if (!r.ok || data.status !== "ok") throw new Error();
      setState(data);
    } catch { setNotice("We couldn’t load operations. Try refreshing the page."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function run(action: string) {
    setBusy(true); setNotice("");
    try {
      if (action === "test") {
        if (!await reportClientError(new TypeError("Controlled monitoring check"), "test")) throw new Error();
        setNotice("The test was received. Check the list below and your inbox. Alerts are limited to one per hour.");
      } else {
        const r = await fetch("/api/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
        if (!r.ok) throw new Error();
        setNotice(action === "verify" ? "The test file was recovered and its checksum matched." : "The file backup check finished.");
      }
      await load();
    } catch { setNotice("We couldn’t finish that check. Try again, then check the server logs if it continues."); }
    finally { setBusy(false); }
  }
  return <>
    <section className="admin-panel"><h2>File protection</h2><p>Uploaded church files are copied into protected database records. Supabase’s daily database backups include those copies.</p>
      {state ? <><p><strong>{state.protected_files} files protected</strong> · {state.pending} waiting for a copy · {state.eligible_files} active files</p><p>Latest check: {when(state.last_run?.finished_at)}{state.last_run ? " · " + state.last_run.status : ""}</p><p>File recovery verified: {when(state.last_recovery_check)}</p></> : <p>Loading file protection…</p>}
      <div className="admin-actions"><button type="button" className="admin-button" disabled={busy} onClick={() => void run("backup")}>Back up files</button><button type="button" className="admin-button" disabled={busy} onClick={() => void run("verify")}>Verify file recovery</button></div>
      <p>The recovery check uses a harmless test file. Practice files are cleared with the practice room and are excluded from backups.</p>
    </section>
    <section className="admin-panel"><h2>App monitoring</h2><p>Chris receives an email when new issues need a check, at most once per hour. Reports exclude answers, names, error messages and room links.</p><p>Latest alert: {when(state?.last_alert?.sent_at)}</p>
      <div className="admin-actions"><button type="button" className="admin-button" disabled={busy} onClick={() => void run("test")}>Verify monitoring</button><button type="button" className="admin-button" disabled={busy} onClick={() => void load()}>Refresh status</button></div>
      {state && !state.errors.length && <p>No app problems have been recorded.</p>}
      <ul className="admin-list">{state?.errors.map(e => <li className="admin-card" key={e.id}><div><h3>{e.event.name}{e.event.kind === "test" ? " · Test" : ""}</h3><p>{e.event.route} · {e.occurrences} reports · {when(e.last_seen)}</p><p>Version: {e.release.slice(0, 7)}</p>{e.event.frames.map(frame => <p key={frame}><code>{frame}</code></p>)}</div></li>)}</ul>
    </section>
    <p role="status" aria-live="polite">{busy ? "Running the check…" : notice}</p>
    <section className="admin-panel"><h2>Recent protected copies</h2><ul className="admin-list">{state?.backups.map(b => <li className="admin-card" key={b.id}><div><strong>{b.name}{b.probe ? " · Recovery test" : ""}</strong><p>{b.bytes.toLocaleString()} bytes · {when(b.completed_at)}</p><p><code>{b.sha256}</code></p></div><a className="admin-button" href={"/api/operations/backups/" + b.id}>Download protected copy</a></li>)}</ul></section>
  </>;
}

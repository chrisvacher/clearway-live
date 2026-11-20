"use client";
import { useCallback, useEffect, useState } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsCard, SettingsSection } from "@/components/ui/settings";
import { reportClientError } from "@/lib/operations/client";
import type { SafeEvent } from "@/lib/operations/telemetry";
import { formatInZone } from "@/lib/time/format";

type Problem = { id: string; event: SafeEvent; release: string; occurrences: number; last_seen: string };
type State = {
  eligible_files: number; protected_files: number; pending: number;
  last_run: { status: string; finished_at: string | null } | null; last_recovery_check: string | null;
  last_alert: { sent_at: string | null } | null;
  errors: Problem[];
  backups: { id: string; name: string; bytes: number; sha256: string; completed_at: string; probe: boolean }[];
};

function problemGroups(errors: Problem[]) {
  const groups = new Map<string, Problem>();
  for (const error of errors) {
    const { event } = error;
    const key = JSON.stringify([event.route, event.kind, event.name, event.issue ?? event.digest ?? event.frames[0]]);
    const existing = groups.get(key);
    const latest = existing && Date.parse(existing.last_seen) > Date.parse(error.last_seen) ? existing : error;
    const frames = [...new Set([...(latest.event.frames ?? []), ...(existing?.event.frames ?? []), ...(event.frames ?? [])])].slice(0, 12);
    groups.set(key, { ...latest, event: { ...latest.event, frames }, occurrences: (existing?.occurrences ?? 0) + error.occurrences });
  }
  return [...groups.entries()].sort(([, a], [, b]) => Date.parse(b.last_seen) - Date.parse(a.last_seen));
}

function errorName(event: SafeEvent) {
  if (event.issue === "react_418") return "Hydration mismatch";
  return event.kind === "test" ? `${event.name} · Test` : event.name;
}

export function OperationsPanel() {
  const [state, setState] = useState<State | null>(null);
  const [checked, setChecked] = useState<{ at: number; zone: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/operations", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || data.status !== "ok") throw new Error();
      setState(data);
      setChecked({ at: Date.now(), zone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    } catch { setNotice("We couldn't load operations. Try refreshing the page."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function run(action: "test" | "backup" | "verify") {
    setBusy(true); setNotice("");
    try {
      if (action === "test") {
        if (!await reportClientError(new TypeError("Controlled monitoring check"), "test")) throw new Error();
        setNotice("The test was received. Check the list below and your inbox. Alerts are limited to one per hour.");
      } else {
        const response = await fetch("/api/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
        if (!response.ok) throw new Error();
        setNotice(action === "verify" ? "The test file was recovered and its checksum matched." : "The file backup check finished.");
      }
      await load();
    } catch { setNotice("We couldn't finish that check. Try again, then check the server logs if it continues."); }
    finally { setBusy(false); }
  }

  const zone = checked?.zone ?? "UTC";
  const when = (value?: string | null) => value ? formatInZone(value, zone) : "Not recorded yet";
  const groups = problemGroups(state?.errors ?? []);
  const healthy = state && !groups.length && state.last_run?.status !== "failed";
  const checkDay = checked ? formatInZone(checked.at, zone, "date") : "";
  const lastSeen = (at: string) => formatInZone(at, zone, "date") === checkDay ? `${formatInZone(at, zone, "time")} today` : when(at);

  return <div className="cwl-g-operations-stack">
    {state && checked ? <div className="cwl-g-health" role="status" data-healthy={healthy}>
      {healthy ? <CircleCheck size={20} aria-hidden="true" /> : <TriangleAlert size={20} aria-hidden="true" />}
      <strong>{groups.length ? `${groups.length} ${groups.length === 1 ? "problem needs" : "problems need"} a look.` :
        healthy ? `All good. No new problems since ${formatInZone(state.last_run?.finished_at ?? checked.at, zone, "date")}.` : "The last file check needs a look."}</strong>
      <span>Last checked at {formatInZone(checked.at, zone, "time")}</span>
    </div> : <div className="cwl-g-health"><p>{notice || "Checking operations"}</p></div>}
    <section className="admin-panel cwl-g-problems" aria-labelledby="operations-problems">
      <div className="cwl-g-section-head">
        <div><h2 id="operations-problems">Problems</h2><p>Latest alert: {when(state?.last_alert?.sent_at)}</p></div>
        <div className="admin-actions">
          <Button size="small" disabled={busy} onClick={() => void run("test")}>Verify monitoring</Button>
          <Button size="small" disabled={busy} onClick={() => void load()}>Refresh status</Button>
        </div>
      </div>
      {state && !groups.length && <p>No app problems have been recorded.</p>}
      <ul className="cwl-g-problem-list">{groups.map(([key, item]) => <li key={key}>
        <div className="cwl-g-problem-row">
          <h3>{errorName(item.event)} · {item.event.route}</h3>
          <span>{item.occurrences} {item.occurrences === 1 ? "time" : "times"}</span>
          <span>last {lastSeen(item.last_seen)}</span>
          <span>Version {item.release.slice(0, 7)}</span>
          <Button variant="quiet" size="small" aria-expanded={expanded.has(key)} onClick={() => setExpanded(previous => {
            const next = new Set(previous);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
          })}>{expanded.has(key) ? "Hide details" : "Show details"}</Button>
        </div>
        {expanded.has(key) && (item.event.frames.length
          ? <pre className="cwl-g-problem-frames">{item.event.frames.join("\n")}</pre>
          : <p>No stack lines were recorded.</p>)}
      </li>)}</ul>
    </section>
    <p className="cwl-g-operations-notice" role="status">{busy ? "Running the check" : notice}</p>
    <SettingsCard>
      <SettingsSection title="File protection" description="Daily database backups include protected copies of uploaded church files.">
        <div className="cwl-g-settings-wide">
          {state && <><p><strong>{state.protected_files} {state.protected_files === 1 ? "file" : "files"} protected</strong> · {state.pending} waiting for a copy · {state.eligible_files} active {state.eligible_files === 1 ? "file" : "files"}</p>
            <p>Latest check: {when(state.last_run?.finished_at)}{state.last_run ? " · " + state.last_run.status : ""}</p>
            <p>File recovery verified: {when(state.last_recovery_check)}</p></>}
          <div className="admin-actions">
            <Button disabled={busy} onClick={() => void run("backup")}>Back up files</Button>
            <Button disabled={busy} onClick={() => void run("verify")}>Verify file recovery</Button>
          </div>
          <p>The recovery check uses a test file. Backups exclude practice files.</p>
        </div>
      </SettingsSection>
      <SettingsSection title="Recent protected copies">
        <div className="cwl-g-settings-wide">
          {state && !state.backups.length && <p>No protected copies yet.</p>}
          <ul className="cwl-g-copy-list">{state?.backups.map(copy => <li key={copy.id}>
            <div><strong>{copy.name}{copy.probe ? " · Recovery test" : ""}</strong>
              <p>{copy.bytes.toLocaleString("en-CA")} bytes · {when(copy.completed_at)}</p>
              <code>{copy.sha256}</code>
            </div>
            <a className="cwl-ui-button cwl-ui-button--secondary" href={"/api/operations/backups/" + copy.id}>Download protected copy</a>
          </li>)}</ul>
        </div>
      </SettingsSection>
    </SettingsCard>
  </div>;
}

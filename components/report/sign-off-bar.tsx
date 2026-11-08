"use client";
import { BadgeCheck, TriangleAlert } from "lucide-react";
import { blockerText, plural, signOffBlockers, type ReportState } from "@/lib/report/policy";
import type { Api } from "./use-report";

type Ok = Extract<ReportState, { status: "ok" }>;
const stamp = (iso: string, zone: string) => new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

// Where the report stands against sign-off. Only the lead signs off, every section has to be reviewed first and every sentence that is not the
// facilitator's own has to have a source. A report changed after it was signed can be signed again as the next version; earlier versions stay.
export function SignOffBar({ state, api, zone, jump }: { state: Ok; api: Api; zone: string; jump: (key: string) => void }) {
  const blockers = signOffBlockers(state), reviewed = state.sections.filter(s => s.status === "reviewed").length, signed = state.signed;
  const stale = Boolean(signed?.stale), ready = blockers.length === 0;
  return <div className={`rpt-bar${signed && !stale ? " is-signed" : ""}`} data-testid="rpt-signoff" data-state={signed ? (stale ? "changed" : "signed") : ready ? "ready" : "blocked"}>
    <div className="ovr-row is-between">
      <span><b>{reviewed} of {state.sections.length || 14} sections reviewed</b>
        {signed && <span className="ovr-muted"> · {`${stale ? "Version" : "Signed off as version"} ${signed.n}${stale ? " was signed off" : ""} by ${signed.by ?? "the lead"}, ${stamp(signed.signed_at, zone)}${stale ? ", and the report has changed since" : ""}`}</span>}</span>
      {(!signed || stale) && <button type="button" className="ovr-btn is-confirm" disabled={!ready || api.busy} onClick={() => void api.act({ action: "sign_off", id: crypto.randomUUID() })} data-testid="rpt-sign-off"><BadgeCheck aria-hidden="true" />{signed ? `Sign off version ${signed.n + 1}` : "Sign off the report"}</button>}
      {signed && !stale && <span className="ovr-st is-reviewed" data-testid="rpt-signed"><BadgeCheck aria-hidden="true" />Signed off</span>}
    </div>
    {(!signed || stale) && blockers.length > 0 && <ul data-testid="rpt-blockers">{blockers.map(b => <li key={b.kind}><TriangleAlert aria-hidden="true" className="rpt-ico" />{blockerText(b)}
      {b.sections.length > 0 && b.kind !== "drafting" && <> {b.sections.slice(0, 4).map(k => <button key={k} type="button" className="ovr-btn is-ghost is-sm" onClick={() => jump(k)}>{state.sections.find(s => s.key === k)?.heading ?? k}</button>)}{b.sections.length > 4 ? ` and ${plural(b.sections.length - 4, "more")}` : ""}</>}</li>)}</ul>}
    {signed && stale && <p className="ovr-muted" role="status">The report has changed since version {signed.n} was signed. Version {signed.n} is kept as it was signed.</p>}
  </div>;
}

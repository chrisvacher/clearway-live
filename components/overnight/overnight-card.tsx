"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell, Loader } from "lucide-react";
import type { OvernightSummary } from "./types";
import "./overnight.css";

// "Drafts ready" on the control surface and the remote: a hint from the database, then a read of the summary
// (outcome names and where each stands, never the drafts). Review itself is on the laptop.
export function OvernightCard({ engagement, tick, link }: { engagement: string; tick: number; link: boolean }) {
  const [summary, setSummary] = useState<OvernightSummary | null>(null);
  const load = useCallback(async () => {
    try { const response = await fetch(`/api/overnight/${engagement}?summary=1`, { cache: "no-store" }); setSummary(await response.json() as OvernightSummary); } catch { /* Keep the last read. */ }
  }, [engagement]);
  useEffect(() => { void load(); }, [load, tick]);
  useEffect(() => { const t = setInterval(() => void load(), 20000); return () => clearInterval(t); }, [load]);
  if (!summary || summary.status === "denied" || summary.status === "unavailable") return <p className="ovr-muted">Reading the overnight review.</p>;
  if (summary.status === "none") return <p className="ovr-muted" data-testid="overnight-none">Drafts start when Day 1 closes.</p>;
  const running = summary.round === "pending" || summary.round === "drafting";
  return <div className="ovr-card" data-testid="overnight-card">
    {running ? <div className="ovr-card-ready" data-testid="overnight-drafting"><Loader aria-hidden="true" />Tidying · {summary.tidied} of {summary.total}</div>
      : <div className="ovr-card-ready" data-testid="overnight-ready"><Bell aria-hidden="true" />{summary.published_at ? "Published for Day 2" : summary.round === "ai_off" ? "Write the drafts by hand" : summary.round === "failed" ? "Drafts need writing by hand" : "Drafts ready"}</div>}
    <ul>{summary.outcomes.map(o => <li key={o.name}><b>{o.name}</b><span>{o.reviewed ? "Reviewed" : o.tidy === "waiting" ? "Tidying" : o.editing ? "Editing" : o.thin ? "Thin" : "To review"}</span></li>)}</ul>
    <p className="ovr-muted">{summary.reviewed} of {summary.total} reviewed. Review on the laptop. The confirm opens on Day 2 at 9:00.</p>
    {link && <Link className="show-button is-small" href={`/control/${engagement}/review`}>Open the overnight review</Link>}
  </div>;
}

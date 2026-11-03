import Link from "next/link";
import { notFound } from "next/navigation";
import { EyeOff } from "lucide-react";
import { requireFacilitator } from "@/lib/server/facilitator";
import { uuid } from "@/lib/room/identity";
import { readShow } from "@/lib/run-of-show/server";
import { reportWindow, seconds, verdict, type LatencyReport } from "@/lib/latency/report";

export const metadata = { title: "Phone to TV", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function LatencyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const { id } = await params; if (!uuid(id)) notFound();
  const query = await searchParams;
  const { client } = await requireFacilitator();
  const show = await readShow(client, id); if (!show) notFound();
  const window = reportWindow(query.from, query.to);
  const { data } = await client.rpc("latency_report", { p_engagement: id, p_from: window.from, p_to: window.to });
  if (!data || data.status !== "ok") notFound();
  const report = data as LatencyReport, result = verdict(report), zone = show.context.timezone;
  const when = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const hourAgo = new Date(Date.now() - 3600e3).toISOString();
  return <main id="main" className="tv-manager latency-report">
    <div className="ctl-row"><Link className="show-button" href={`/control/${id}`}>Return to the live room</Link>
      <Link className="show-button" href={`/control/${id}/latency?from=${encodeURIComponent(hourAgo)}`}>Show the last hour</Link>
      <Link className="show-button" href={`/control/${id}/latency`}>Show the last 12 hours</Link></div>
    <div className="tv-manager-heading"><p className="ctl-eyebrow">{show.context.church} · {show.context.title}</p><h1>Phone to TV</h1>
      <p>From {when(report.from)} to {when(report.to)} ({zone}). Each answer counts once, when the slowest paired TV received it.</p></div>
    <section className="ctl-private" aria-label="Phone to TV, only you see this"><div className="show-private"><EyeOff size={16} aria-hidden="true" />Only you see this<span>Latency log</span></div>
      <div className="ctl-private-body">
        <p className={`latency-verdict${result.met ? " is-met" : ""}`} role="status">{result.label}</p>
        <div className="ctl-stats">
          <div><b>{seconds(report.phone_tv.p50)}</b><span>Typical (median)</span></div>
          <div><b>{seconds(report.phone_tv.p95)}</b><span>95th percentile</span></div>
          <div><b>{seconds(report.phone_tv.p99)}</b><span>99th percentile</span></div>
          <div><b>{seconds(report.phone_tv.max)}</b><span>Slowest</span></div>
        </div>
        <table className="latency-table"><tbody>
          <tr><th scope="row">Phone to server, 95th</th><td>{seconds(report.phone_server.p95)}</td></tr>
          <tr><th scope="row">Server to TV, 95th</th><td>{seconds(report.server_tv.p95)}</td></tr>
          <tr><th scope="row">Answers sent</th><td>{report.sent}</td></tr>
          <tr><th scope="row">Saved offline, sent later (not counted)</th><td>{report.queued}</td></tr>
          <tr><th scope="row">Not received by a TV</th><td>{report.missing_tv}</td></tr>
          <tr><th scope="row">Clock uncertainty, up to</th><td>{report.uncertainty_ms == null ? "No data" : `${report.uncertainty_ms} ms`}</td></tr>
        </tbody></table>
        {report.sessions.length > 0 && <table className="latency-table"><thead><tr><th scope="col">Session</th><th scope="col">Under 1 second</th><th scope="col">95th</th></tr></thead>
          <tbody>{report.sessions.map(s => <tr key={s.id}><th scope="row">{s.title}</th><td>{s.under_second} of {s.measured}</td><td>{seconds(s.p95)}</td></tr>)}</tbody></table>}
      </div>
    </section>
  </main>;
}

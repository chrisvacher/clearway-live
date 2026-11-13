import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleAlert, CircleCheck, Radio } from "lucide-react";
import { requireFacilitator } from "@/lib/server/facilitator";
import { uuid } from "@/lib/room/policy";
import { roomQr } from "@/lib/tv/qr";
import { eventDate, statusName, typeName, type ListedEngagement } from "@/lib/setup/listing";
import { inviteText, joiningLine, runLine, type ReadyState } from "@/lib/setup/overview";
import { InviteCard } from "@/components/facilitator/invite-card";

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

function Row({ state, title, text, href, action }: { state: ReadyState; title: string; text: string; href: string; action: string }) {
  return <li className="ready-row">
    <span className={`ready-chip is-${state}`}>{state === "ready" ? <><CircleCheck size={14} aria-hidden="true" />Ready</> : state === "todo" ? <><CircleAlert size={14} aria-hidden="true" />To do</> : "Optional"}</span>
    <div><strong>{title}</strong><p>{text}</p></div>
    <Link className="admin-button" href={href}>{action}<span className="sr-only">: {title}</span></Link>
  </li>;
}

// Where an engagement opens: is this event ready, and how do people get in.
export default async function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) notFound();
  const { client } = await requireFacilitator();
  const { data: e } = await client.from("engagements").select("id,title,type,status,room_code,link_name,settings,start_date,end_date,retreat_start_date,retreat_end_date,pre_call_at,team_hub_client_id,church:churches!engagements_church_id_fkey(name,timezone)").eq("id", id).eq("deleted", false).maybeSingle();
  if (!e) notFound();
  const church = e.church as unknown as { name: string; timezone: string } | null;
  const [sessions, attendees, presence, lead, tv] = await Promise.all([
    client.from("sessions").select("part,planned_minutes,state").eq("engagement_id", id).eq("deleted", false).limit(1000),
    client.from("attendees").select("id", { count: "exact", head: true }).eq("engagement_id", id).eq("deleted", false),
    client.rpc("room_presence", { p_engagement: id }),
    client.from("engagement_facilitators").select("role,user:clearway_users(name)").eq("engagement_id", id).eq("deleted", false),
    client.rpc("tv_manage", { p_engagement: id, p_action: "list", p: {} }),
  ]);
  const rows = sessions.data ?? [];
  const run = runLine({ count: rows.length, minutes: rows.reduce((n, s) => n + s.planned_minutes, 0), notReady: rows.filter(s => s.state === "draft").length, sections: new Set(rows.map(s => s.part)).size });
  const settings = (e.settings ?? {}) as { open_join?: boolean; ai_enabled?: boolean };
  const open = e.type === "team_workshop" && settings.open_join === true;
  const joining = joiningLine(open, attendees.count ?? 0, ((presence.data ?? []) as unknown[]).length);
  const screens = ((tv.data as { screens?: unknown[] } | null)?.screens ?? []).length;
  const when = eventDate(e as unknown as ListedEngagement, church?.timezone);
  const leadName = ((lead.data ?? []) as unknown as { role: string; user: { name: string } | null }[]).find(f => f.role === "lead")?.user?.name;
  const link = `live.clearway.co/${e.link_name ?? e.room_code}`, churchName = church?.name ?? "Church not named";
  const ready = run.state === "ready" && joining.state === "ready";
  return <main id="main" className="admin-page">
    <header className="admin-heading"><div><div className="admin-kicker">{churchName} · {e.title}</div><h1>Overview</h1></div>
      <div className="admin-actions"><span className={`ready-chip is-${ready ? "ready" : "optional"}`}>{e.status === "setup" && ready ? "Ready to share" : statusName(e.status)}</span><Link className="admin-button is-primary" href={`/control/${id}`}><Radio size={16} aria-hidden="true" />Open the live room</Link></div></header>
    <div className="overview-columns">
      <section className="admin-panel" aria-labelledby="ready-title"><h2 id="ready-title">Getting ready</h2>
        <p>{[typeName(e.type), when ?? "No date yet", leadName].filter(Boolean).join(" · ")}</p>
        <ul className="ready-list">
          <Row state={when ? "ready" : "todo"} title="Details" text={when ? `${typeName(e.type)}, ${when}${settings.ai_enabled ? ", AI on in live sessions" : ""}` : "No date yet. Add the date so it sorts with your upcoming engagements"} href={`/setup/${id}/details`} action="Edit details" />
          <Row state={run.state} title="Run of show" text={run.text} href={rows.length ? `/setup/${id}/run-of-show` : `/setup/templates?engagement=${id}`} action={rows.length ? "Open run of show" : "Use a template"} />
          <Row state={joining.state} title="People and joining" text={joining.text} href={`/setup/${id}/joining`} action="Change" />
          <Row state={screens ? "ready" : "todo"} title="Screens" text={screens ? `${screens} ${screens === 1 ? "TV" : "TVs"} paired` : "No TV paired yet. Pair it on the day, or check the screen ahead of time"} href={`/setup/${id}/tv`} action="Pair a TV" />
        </ul>
      </section>
      <InviteCard id={id} code={e.room_code} link={link} qr={roomQr(e.room_code)} invite={inviteText(churchName, e.title, when, `https://${link}`, e.room_code)} closed={e.status === "closed"} />
    </div>
  </main>;
}

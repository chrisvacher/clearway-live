import { notFound } from "next/navigation";
import { ChevronRight, CircleCheck, CircleDashed } from "lucide-react";
import { requireFacilitator } from "@/lib/server/facilitator";
import { uuid } from "@/lib/room/policy";
import { roomQr } from "@/lib/tv/qr";
import { brandFor, skinOf } from "@/lib/brand";
import { eventDate, place, typeName, type ListedEngagement } from "@/lib/setup/listing";
import { eventDayOffset, inviteText, joiningLine, overviewReadiness, roomTime, runLine } from "@/lib/setup/overview";
import { readEngagementCreationCapability, readOverviewFacts, teamHubPlaces } from "@/lib/setup/overview-server";
import { stageFor } from "@/lib/setup/stage";
import { InviteCard, OnTheDay } from "@/components/facilitator/invite-card";
import { OverviewHeader } from "@/components/facilitator/overview-header";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

export default async function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid(id)) notFound();
  const { client, profile } = await requireFacilitator();
  const { data: engagement } = await client.from("engagements")
    .select("id,title,type,status,room_code,link_name,skin,settings,start_date,end_date,retreat_start_date,retreat_end_date,pre_call_at,team_hub_client_id,church:churches!engagements_church_id_fkey(name,timezone)")
    .eq("id", id).eq("deleted", false).maybeSingle();
  if (!engagement) notFound();

  const settings = (engagement.settings ?? {}) as { open_join?: boolean; ai_enabled?: boolean };
  const openJoin = engagement.type === "team_workshop" && settings.open_join === true;
  const joinedCount = openJoin
    ? client.from("attendees").select("id", { count: "exact", head: true }).eq("engagement_id", id)
      .eq("deleted", false).like("email", "%@guest.clearway.invalid").not("verified_at", "is", null).then(result => result.count ?? 0)
    : client.rpc("room_presence", { p_engagement: id }).then(result => Array.isArray(result.data) ? result.data.length : 0);
  const [facts, signedIn, lead, locations, canDuplicate] = await Promise.all([
    readOverviewFacts(client, id), joinedCount,
    client.from("engagement_facilitators").select("user:clearway_users(name)").eq("engagement_id", id).eq("role", "lead").eq("deleted", false).maybeSingle(),
    teamHubPlaces([engagement.team_hub_client_id]), profile.is_admin && engagement.type !== "practice" ? readEngagementCreationCapability(client) : false,
  ]);
  const church = engagement.church as unknown as { name: string; timezone: string } | null;
  const timezone = church?.timezone ?? "America/Toronto";
  const churchName = church?.name ?? "Church not named";
  const date = eventDate(engagement as unknown as ListedEngagement, timezone);
  const readiness = overviewReadiness({ ...facts, hasDate: !!date, openJoin });
  const stage = stageFor(engagement, readiness, { live_session_id: facts.liveSessionId });
  const ready = readiness.filter(item => item.state === "ready").length;
  const location = engagement.team_hub_client_id ? place(locations.get(engagement.team_hub_client_id)) : null;
  const leadName = (lead.data?.user as unknown as { name: string } | null)?.name;
  const startDay = (engagement.type !== "team_workshop" && engagement.retreat_start_date) || engagement.start_date;
  const delta = eventDayOffset(startDay, timezone, new Date());
  const starts = facts.firstPlanned ? roomTime(facts.firstPlanned, timezone) : null;
  const ends = facts.lastPlanned ? roomTime(facts.lastPlanned, timezone) : null;
  const when = [date, starts && (ends ? `${starts} to ${ends}` : starts)].filter(Boolean).join(" · ") || null;
  const countdown = stage === "done" || stage === "closed" ? null : stage === "live" ? "Live now"
    : delta === 0 ? `Today${starts ? `, ${starts}` : ""}`
    : delta === 1 ? "Starts tomorrow" : delta !== null && delta > 1 ? `Starts in ${delta} days` : null;
  const brand = brandFor(skinOf(engagement.skin));
  const slug = engagement.link_name ?? engagement.room_code, link = `${brand.host}/${slug}`, href = `${brand.origin}/${slug}`;
  const cards = {
    details: { title: "Details", text: date ? `${typeName(engagement.type)}, ${date}${settings.ai_enabled ? ", AI on in live sessions" : ""}` : "Add the date so the event appears under Upcoming.", path: "details", action: "Edit" },
    run: { title: "Run of show", text: runLine(facts.stepCount, facts.draftCount, facts.minutes), path: "run-of-show", action: "Open" },
    people: { title: "People", text: joiningLine(openJoin, facts.attendeeCount, signedIn), path: "joining", action: "Change" },
    screens: { title: "Screens", text: facts.screenCount ? `${facts.screenCount} ${facts.screenCount === 1 ? "TV" : "TVs"} paired.` : "Pair a TV on the day, or check it ahead of time.", path: "tv", action: "Set up" },
  };
  const closed = engagement.status === "closed";

  return <main id="main" className="admin-page eng-overview">
    <OverviewHeader id={id} church={churchName} title={engagement.title} type={engagement.type} stage={stage}
      when={when} place={location} lead={leadName} countdown={countdown} canDuplicate={canDuplicate} />
    <div className="eng-overview-grid">
      <section className="admin-panel eng-ready" aria-labelledby="eng-ready-title">
        <header><h2 id="eng-ready-title">Getting ready</h2><span>{ready} of {readiness.length} ready</span></header>
        <progress value={ready} max={readiness.length} aria-label="Getting ready" />
        <ul>{readiness.map(({ key, state }) => {
          const { title, text, path, action } = cards[key];
          const Icon = state === "ready" ? CircleCheck : CircleDashed;
          return <li key={key}>
            <Icon className={`eng-ready-status is-${state}`} aria-label={state === "ready" ? "Ready" : "To do"} />
            <div><strong>{title}</strong><p>{text}</p></div>
            <Button variant="quiet" size="small" href={`/admin/${id}/${path}`} aria-label={`${action} ${title}`}>
              {action}<ChevronRight aria-hidden="true" />
            </Button>
          </li>;
        })}</ul>
      </section>
      <div className="eng-overview-aside">
        <InviteCard code={engagement.room_code} link={link} href={href} host={brand.host}
          qr={roomQr(engagement.room_code, brand.skin, engagement.link_name)}
          invite={inviteText(churchName, engagement.title, when, href, engagement.room_code, brand.host)} closed={closed} />
        <OnTheDay id={id} closed={closed} remoteUrl={`${brandFor("clearway").origin}/remote/${id}`} />
      </div>
    </div>
  </main>;
}

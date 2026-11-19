"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Plus, Search } from "lucide-react";
import { setupRequest } from "./setup-editor";
import { consensus, zonedInstant } from "@/lib/setup/policy";
import { length } from "@/lib/setup/overview";
import { cleanLinkName, linkNameProblem, suggestLinkName } from "@/lib/setup/link-name";
import { supportedZones, zoneOptions } from "@/lib/setup/timezones";
import { brandFor, skinOf } from "@/lib/brand";
import type { HubClient, HubEngagement } from "@/lib/team-hub/reader";
import { Select } from "@/components/ui/select";
import { BrandField } from "./brand-field";

type Listed = HubEngagement & { live_id?: string };
type LiveChurch = { id: string; name: string; timezone: string; team_hub_client_id: string | null };
// The church the event is for: one already in Live, one from Team Hub, or a new one typed here.
type Chosen = { from: "live"; church: LiveChurch } | { from: "hub"; client: HubClient } | { from: "new"; name: string };
export type StartTemplate = { id: string; name: string; count: number; minutes: number };
const kinds = [["wayfinding", "Wayfinding", "Two days, with a pre-call"], ["day_and_a_half", "Day and a half", "With a follow-up on video"], ["team_workshop", "Workshop", "Any session you design"]] as const;
const workshopLine = "This is a workshop, not a decision meeting. Your answers show us where the room is and shape the conversation. Answers are anonymous on the screen.";
const nextDay = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const nameOf = (c: Chosen) => c.from === "live" ? c.church.name : c.from === "hub" ? c.client.name : c.name;

// Create an engagement in four short answers: who, what kind, when and how people join. Everything else has a default
// and is edited afterwards (design pass 8). November 17: Team Hub is optional, and the room link is chosen here.
export function CreateEngagement({ lead, templates, hubConfigured, admin = true }: { lead: string; templates: StartTemplate[]; hubConfigured: boolean; admin?: boolean }) {
  const router = useRouter();
  const [search, setSearch] = useState(""), [found, setFound] = useState<{ live: LiveChurch[]; hub: HubClient[]; typed: string } | null>(null), [chosen, setChosen] = useState<Chosen | null>(null);
  const [engagements, setEngagements] = useState<Listed[]>([]), [hub, setHub] = useState(""), [newZone, setNewZone] = useState("America/Toronto"), [zones, setZones] = useState<string[]>([]);
  const [kind, setKind] = useState("team_workshop"), [title, setTitle] = useState(""), [template, setTemplate] = useState("");
  const [skin, setSkin] = useState("clearway"), [date, setDate] = useState(""), [time, setTime] = useState("09:00"), [open, setOpen] = useState(true);
  const [link, setLink] = useState(""), [linkEdited, setLinkEdited] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [existing, setExisting] = useState("");
  useEffect(() => setZones(supportedZones()), []);
  const workshop = kind === "team_workshop";
  const hubClientId = chosen?.from === "hub" ? chosen.client.id : chosen?.from === "live" ? chosen.church.team_hub_client_id : null;
  const zone = chosen?.from === "live" ? chosen.church.timezone : chosen?.from === "hub" ? chosen.client.timezone || "America/Toronto" : newZone;
  const host = brandFor(skinOf(admin ? skin : "clearway")).host;
  const linkCheck = link ? linkNameProblem(link) : null, needsLink = workshop && open;

  async function perform(action: () => Promise<void>) {
    setBusy(true); setMessage(""); setExisting("");
    try { await action(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Please try again."); if (e instanceof Error && "existingId" in e && typeof e.existingId === "string") setExisting(e.existingId); }
    finally { setBusy(false); }
  }
  function pickChurch(next: Chosen | null) {
    setChosen(next); setEngagements([]); setHub("");
    if (next && !linkEdited) setLink(suggestLinkName(nameOf(next)));
  }
  // One search finds churches already in Live and churches in Team Hub, and offers the typed name as a new church.
  const find = (event: FormEvent) => {
    event.preventDefault();
    const typed = search.trim();
    void perform(async () => {
      const [live, hubbed] = await Promise.all([setupRequest({ action: "live_churches", search: typed }),
        hubConfigured && typed ? setupRequest({ action: "hub_clients", search: typed }).catch(() => ({ clients: [] })) : Promise.resolve({ clients: [] })]);
      const liveChurches = (live.churches ?? []) as LiveChurch[], linked = new Set(liveChurches.map(c => c.team_hub_client_id).filter(Boolean));
      setFound({ live: liveChurches, hub: ((hubbed.clients ?? []) as HubClient[]).filter(c => !linked.has(c.id)), typed });
      pickChurch(null);
    });
  };
  // Team Hub engagements are only a link: offered when the church is in Team Hub, never required.
  useEffect(() => {
    if (!hubClientId || !hubConfigured) return;
    let live = true;
    setupRequest({ action: "hub_engagements", client: hubClientId }).then(result => { if (live) setEngagements(result.engagements ?? []); }).catch(() => { if (live) setEngagements([]); });
    return () => { live = false; };
  }, [hubClientId, hubConfigured]);
  function pick(e: Listed) {
    if (hub === e.id) { setHub(""); return; }
    setHub(e.id); setTitle(t => t || e.title); if (e.start_date) setDate(d => d || e.start_date!.slice(0, 10));
    if (["wayfinding", "day_and_a_half", "team_workshop"].includes(e.engagement_type)) setKind(e.engagement_type);
  }
  const create = (event: FormEvent) => {
    event.preventDefault();
    void perform(async () => {
      if (!chosen) throw new Error("Choose the church this event is for.");
      if (needsLink && !link) throw new Error("Choose the room link people will use to join.");
      if (linkCheck?.problem) throw new Error(linkCheck.problem);
      const start = template && date ? zonedInstant(`${date}T${time}`, zone) : null;
      const result = await setupRequest({ action: "create", lead, co: "", link_name: link,
        church_id: chosen.from === "live" ? chosen.church.id : "", hub_client: chosen.from === "hub" ? chosen.client.id : chosen.from === "live" && hub ? chosen.church.team_hub_client_id ?? "" : "", hub_engagement: hub,
        church: { name: nameOf(chosen), timezone: zone, logo_url: chosen.from === "hub" ? chosen.client.logo || "" : "", mission: "", purpose: "", values: "", strategy: "", leadership_rhythms: "", governance_body_name: "" },
        engagement: { title, type: kind, status: "setup", start_date: workshop ? date : "", end_date: "", retreat_start_date: workshop ? "" : date, retreat_end_date: !workshop && date ? nextDay(date) : "", pre_call_local: "", base_year: "",
          lens_names: ["Congregation", "Community", "Leadership", "Operations", "Learning"], how_the_room_decides: workshop ? workshopLine : consensus, skin: admin ? skin : "clearway",
          settings: { ai_enabled: true, scripture_translation: "", tv_theme: "dark", texture: true, room_size: "very_small", neutral_join_message: false, open_join: workshop && open } } });
      if (template && start) {
        const response = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply", input: { template, engagement: result.id, start } }) });
        const applied = await response.json().catch(() => ({}));
        if (!response.ok || applied.status !== "ok") { router.push(`/setup/${result.id}`); return; }
      }
      router.push(`/setup/${result.id}`);
    });
  };
  const nothingFound = found && !found.live.length && !found.hub.length;
  return <div className="admin-editor create-flow">
    <section className="admin-panel" aria-labelledby="create-who"><h2 id="create-who">1. Who is it for</h2><p>Find the church, or add a new one. Linking it to Team Hub is optional.</p>
      <form className="create-search" onSubmit={find} role="search"><label htmlFor="create-church">Church</label><div><input id="create-church" value={search} disabled={busy} onChange={e => setSearch(e.target.value)} /><button className="admin-button" type="submit" disabled={busy}><Search size={16} aria-hidden="true" />Find churches</button></div></form>
      {found && !chosen && <>
        {found.live.length > 0 && <><h3 className="create-group">Already in Live</h3><ul className="create-options" aria-label="Churches in Live">{found.live.map(c => <li key={c.id}><button type="button" className="create-option" disabled={busy} onClick={() => pickChurch({ from: "live", church: c })}><strong>{c.name}</strong><span>{c.team_hub_client_id ? "In Live and Team Hub" : "In Live"} · {c.timezone}</span></button></li>)}</ul></>}
        {found.hub.length > 0 && <><h3 className="create-group">In Team Hub</h3><ul className="create-options" aria-label="Churches in Team Hub">{found.hub.map(c => <li key={c.id}><button type="button" className="create-option" disabled={busy} onClick={() => pickChurch({ from: "hub", client: c })}><strong>{c.name}</strong><span>{[c.city, c.state_province].filter(Boolean).join(", ") || "Team Hub church"}</span></button></li>)}</ul></>}
        {nothingFound && <p>No church matches that yet.</p>}
        {found.typed && <button type="button" className="admin-button" disabled={busy} onClick={() => pickChurch({ from: "new", name: found.typed })}><Plus size={16} aria-hidden="true" />Add {found.typed} as a new church</button>}
        {!hubConfigured && <p className="admin-meta">Team Hub isn’t connected, so only churches already in Live are listed.</p>}
      </>}
      {chosen && <>
        <p className="create-picked"><strong>{nameOf(chosen)}</strong> <span className="admin-meta">{chosen.from === "new" ? "New church" : chosen.from === "live" ? "In Live" : "From Team Hub"}</span> <button type="button" className="text-link" onClick={() => pickChurch(null)}>Choose another church</button></p>
        {chosen.from === "new" && <div className="form-grid"><label>Time zone<Select value={newZone} required onChange={e => setNewZone(e.target.value)}>{zoneOptions(newZone, zones).map(g => <optgroup key={g.label} label={g.label}>{g.zones.map(z => <option key={z} value={z}>{z}</option>)}</optgroup>)}</Select></label></div>}
        {engagements.length > 0 && <><h3 className="create-group">Link a Team Hub engagement (optional)</h3>
          <ul className="create-options" aria-label="Team Hub engagements">
            <li><button type="button" className={`create-option${!hub ? " is-on" : ""}`} aria-pressed={!hub} onClick={() => setHub("")}><strong>Don’t link</strong><span>The event stands on its own.</span></button></li>
            {engagements.map(e => <li key={e.id}>{e.live_id
              ? <div className="create-option is-linked"><strong>{e.title}</strong><span>Already linked to an event. <Link className="text-link" href={`/setup/${e.live_id}`}>Open it</Link></span></div>
              : <button type="button" className={`create-option${hub === e.id ? " is-on" : ""}`} aria-pressed={hub === e.id} onClick={() => pick(e)}><strong>{e.title}</strong><span>{e.start_date ? e.start_date.slice(0, 10) : "No date in Team Hub"}</span></button>}</li>)}
          </ul></>}
      </>}
    </section>
    <form className="form-stack" onSubmit={create}>
      <fieldset className="admin-panel create-step" disabled={busy}><legend>2. What kind of event</legend>
        <div className="create-kinds" role="radiogroup" aria-label="Kind of event">{kinds.map(([value, name, line]) => <label key={value} className={`create-option${kind === value ? " is-on" : ""}`}><input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} /><span><strong>{name}</strong><span>{line}</span></span></label>)}</div>
        <div className="form-grid"><label>Event title<input value={title} required maxLength={200} onChange={e => setTitle(e.target.value)} /></label>
          <label>Start from<Select value={template} onChange={e => setTemplate(e.target.value)}><option value="">A blank run of show</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name} · {length(t.minutes)} · {t.count} {t.count === 1 ? "session" : "sessions"}</option>)}</Select></label>
          <BrandField value={admin ? skin : "clearway"} onChange={setSkin} admin={admin} id="create-brand" /></div>
      </fieldset>
      <fieldset className="admin-panel create-step" disabled={busy}><legend>3. When</legend><div className="form-grid">
        <label>{workshop ? "Date" : "Retreat starts"}<input type="date" value={date} required={workshop || Boolean(template)} onChange={e => setDate(e.target.value)} /></label>
        <label>First session starts<input type="time" value={time} required={Boolean(template)} onChange={e => setTime(e.target.value)} /></label></div>
        <p>Times are in the church’s time zone{chosen ? `, ${zone}` : ""}. You can leave the date for later unless you start from a template.</p>
      </fieldset>
      <fieldset className="admin-panel create-step" disabled={busy}><legend>4. How people join</legend><p>A starting point. You can change it later.</p>
        {workshop && <div className="create-kinds" role="radiogroup" aria-label="How people join">
          <label className={`create-option${open ? " is-on" : ""}`}><input type="radio" name="join" checked={open} onChange={() => setOpen(true)} /><span><strong>Open workshop</strong><span>Anyone with the link, QR code or room code joins with their name.</span></span></label>
          <label className={`create-option${!open ? " is-on" : ""}`}><input type="radio" name="join" checked={!open} onChange={() => setOpen(false)} /><span><strong>Invited team</strong><span>Only people on your list get in, with a sign-in code sent to their email.</span></span></label></div>}
        <div className="cwl-field"><label htmlFor="create-link">Room link{needsLink ? "" : " (optional)"}</label>
          <div className="joining-line"><span aria-hidden="true">{host}/</span><input id="create-link" value={link} maxLength={24} required={needsLink} aria-describedby="create-link-help" placeholder="ppc"
            onChange={e => { setLink(cleanLinkName(e.target.value)); setLinkEdited(true); }} /></div>
          <p id="create-link-help" className={`cwl-help${linkCheck?.problem ? " is-bad" : ""}`}>{linkCheck?.problem ?? (link
            ? `People join at ${host}/${link}, or type ${link} at ${host}. The TV shows it, and its QR code opens it.`
            : needsLink ? "The word people type to join, such as the church’s initials. Letters and numbers only." : "Leave it empty to use a generated room code.")}</p></div>
      </fieldset>
      <div className="admin-actions"><button className="admin-button is-primary" type="submit" disabled={busy || !chosen}>{busy ? "Creating…" : "Create engagement"}</button><Link className="admin-button" href="/setup">Cancel</Link><span className="admin-meta">Everything else has a default you can change afterwards.</span></div>
    </form>
    <p className="admin-feedback" role="status" aria-live="polite">{message}{existing && <> <Link className="text-link" href={`/setup/${existing}`}>Open the existing engagement</Link></>}</p>
  </div>;
}

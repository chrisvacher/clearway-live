"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { engagementRequest } from "./engagement-actions";
import { setupRequest } from "./setup-editor";
import { consensus, zonedInstant } from "@/lib/setup/policy";
import { length } from "@/lib/setup/overview";
import type { HubClient, HubEngagement } from "@/lib/team-hub/reader";
import { Select } from "@/components/ui/select";
import { BrandField } from "./brand-field";

type Listed = HubEngagement & { live_id?: string };
export type StartTemplate = { id: string; name: string; count: number; minutes: number };
const kinds = [["wayfinding", "Wayfinding", "Two days, with a pre-call"], ["day_and_a_half", "Day and a half", "With a follow-up on video"], ["team_workshop", "Workshop", "Any session you design"]] as const;
const workshopLine = "This is a workshop, not a decision meeting. Your answers show us where the room is and shape the conversation. Answers are anonymous on the screen.";
const nextDay = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

// Create an engagement in four short answers: who, what kind, when and how people join. Everything else has a default
// and is edited afterwards (design pass 8).
export function CreateEngagement({ lead, templates, hubConfigured, hosts, canName, admin = true }: {
  lead: string; templates: StartTemplate[]; hubConfigured: boolean; hosts: Record<string, string>; canName: boolean; admin?: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(""), [clients, setClients] = useState<HubClient[]>([]), [client, setClient] = useState<HubClient | null>(null);
  const [engagements, setEngagements] = useState<Listed[]>([]), [hub, setHub] = useState("");
  const [kind, setKind] = useState("team_workshop"), [title, setTitle] = useState(""), [template, setTemplate] = useState("");
  const [skin, setSkin] = useState("clearway"), [date, setDate] = useState(""), [time, setTime] = useState("09:00"), [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [existing, setExisting] = useState("");
  const [searching, setSearching] = useState(false), [searchError, setSearchError] = useState("");
  const [linkName, setLinkName] = useState("");
  const [availability, setAvailability] = useState<{ name: string; status: string } | null>(null);
  const activeStatus = availability?.name === linkName ? availability.status : "";
  const workshop = kind === "team_workshop", zone = client?.timezone || "America/Toronto";

  async function perform(action: () => Promise<void>) {
    setBusy(true); setMessage(""); setExisting("");
    try { await action(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Please try again."); if (e instanceof Error && "existingId" in e && typeof e.existingId === "string") setExisting(e.existingId); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    const term = search.trim();
    setSearchError("");
    setClients([]);
    setSearching(term.length >= 2 && hubConfigured);
    if (term.length < 2 || !hubConfigured) return;
    let current = true;
    const timer = setTimeout(() => {
      void setupRequest({ action: "hub_clients", search: term }).then(result => {
        if (current) setClients(result.clients ?? []);
      }).catch((cause: unknown) => {
        if (current) setSearchError(cause instanceof Error ? cause.message : "We couldn't search Team Hub.");
      }).finally(() => { if (current) setSearching(false); });
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [search, hubConfigured]);

  useEffect(() => {
    if (!canName || !workshop || !/^[a-z0-9]{3,24}$/.test(linkName)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void engagementRequest({ action: "link_name", name: linkName }, controller.signal)
        .then(result => { if (!controller.signal.aborted) setAvailability({ name: linkName, status: result.status ?? "unavailable" }); })
        .catch(() => { if (!controller.signal.aborted) setAvailability({ name: linkName, status: "unavailable" }); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [canName, linkName, workshop]);

  function choose(id: string) {
    const picked = clients.find(c => c.id === id);
    if (!picked || picked.id === client?.id) return;
    setClient(picked);
    setEngagements([]);
    setHub("");
    void perform(async () => {
      const result = await setupRequest({ action: "hub_engagements", client: picked.id });
      setClient(result.client ?? picked);
      setEngagements(result.engagements ?? []);
    });
  }
  function pick(e: Listed) {
    setHub(e.id); setTitle(t => t || e.title); if (e.start_date) setDate(d => d || e.start_date!.slice(0, 10));
    if (["wayfinding", "day_and_a_half", "team_workshop"].includes(e.engagement_type)) setKind(e.engagement_type);
  }
  const create = (event: FormEvent) => {
    event.preventDefault();
    void perform(async () => {
      if (canName && workshop && linkName && activeStatus !== "available") throw new Error("Choose an available link name or leave it blank.");
      if (!client || !hub) throw new Error("Choose a church and engagement from Team Hub.");
      const start = template && date ? zonedInstant(`${date}T${time}`, zone) : null;
      const result = await setupRequest({ action: "create", hub_client: client.id, hub_engagement: hub, lead, co: "",
        ...(canName && workshop && linkName ? { link_name: linkName } : {}),
        church: { name: client.name, timezone: zone, logo_url: client.logo || "", mission: "", purpose: "", values: "", strategy: "", leadership_rhythms: "", governance_body_name: "" },
        engagement: { title, type: kind, status: "setup", start_date: workshop ? date : "", end_date: "", retreat_start_date: workshop ? "" : date, retreat_end_date: !workshop && date ? nextDay(date) : "", pre_call_local: "", base_year: "",
          lens_names: ["Congregation", "Community", "Leadership", "Operations", "Learning"], how_the_room_decides: workshop ? workshopLine : consensus, skin: admin ? skin : "clearway",
          settings: { ai_enabled: true, scripture_translation: "", tv_theme: "dark", texture: true, room_size: "very_small", neutral_join_message: false, open_join: workshop && open } } });
      if (template && start) {
        const response = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply", input: { template, engagement: result.id, start } }) });
        const applied = await response.json().catch(() => ({}));
        if (!response.ok || applied.status !== "ok") { router.push(`/admin/${result.id}`); router.refresh(); return; }
      }
      router.push(`/admin/${result.id}`);
      router.refresh();
    });
  };
  return <div className="admin-editor create-flow">
    {!hubConfigured && <p className="admin-panel">The Team Hub reader is waiting for its approved connection, so new engagements can’t be created yet.</p>}
    <section className="admin-panel" aria-labelledby="create-who"><h2 id="create-who">1. Who is it for</h2><p>Search Team Hub for the church, then choose its engagement.</p>
      <label className="create-church-label" htmlFor="create-church">Church</label>
      <Combobox id="create-church" label="Church" placeholder="Search Team Hub churches" options={clients.map(c => ({
        value: c.id, label: c.name, detail: [c.city, c.state_province].filter(Boolean).join(", "),
      }))} value={client?.id ?? ""} filter={false} busy={searching} disabled={busy || !hubConfigured}
        onQueryChange={setSearch} onChange={choose} />
      {searchError && <p role="alert">{searchError}</p>}
      {client && (engagements.length ? <div className="create-options" role="radiogroup" aria-label="Team Hub engagements">{engagements.map(e => e.live_id
        ? <div key={e.id} className="create-option is-linked"><strong>{e.title}</strong><span>Already in Live. <Link className="text-link" href={`/admin/${e.live_id}`}>Open {e.title}</Link></span></div>
        : <label key={e.id} className={`create-option${hub === e.id ? " is-on" : ""}`}><input type="radio" name="hub-engagement" checked={hub === e.id} onChange={() => pick(e)} />
          <span><strong>{e.title}</strong><span>{e.start_date ? e.start_date.slice(0, 10) : "No date in Team Hub"}</span></span></label>)}</div>
        : !busy && !message && <p>This church has no engagement in Team Hub yet. Add one there first.</p>)}
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
        <p>Times are in the church’s time zone{client ? `, ${zone}` : ""}. You can leave the date for later unless you start from a template.</p>
      </fieldset>
      {workshop && <fieldset className="admin-panel create-step" disabled={busy}><legend>4. How people join</legend><p>A starting point. You can change it later.</p>
        <div className="create-kinds" role="radiogroup" aria-label="How people join">
          <label className={`create-option${open ? " is-on" : ""}`}><input type="radio" name="join" checked={open} onChange={() => setOpen(true)} /><span><strong>Open workshop</strong><span>Anyone with the link, QR code or room code joins with their name.</span></span></label>
          <label className={`create-option${!open ? " is-on" : ""}`}><input type="radio" name="join" checked={!open} onChange={() => setOpen(false)} /><span><strong>Invited team</strong><span>Only people on your list get in, with a sign-in code sent to their email.</span></span></label></div>
        {canName && <div className="create-link">
          <label htmlFor="create-link-name">Link name</label>
          <div className="create-link-row">
            <div className="create-link-field"><span aria-hidden="true">{hosts[skin]}/</span><input id="create-link-name" autoComplete="off" spellCheck={false}
              aria-describedby="create-link-help" value={linkName} maxLength={24} onChange={e => setLinkName(e.target.value.toLowerCase())} /></div>
            {linkName && <span role="status" className={activeStatus === "available" ? "is-available" : activeStatus === "taken_name" ? "is-taken" : ""}>
              {activeStatus === "available" ? "Available" : activeStatus === "taken_name" ? "Taken"
                : activeStatus === "unavailable" ? "Couldn't check" : activeStatus === "reserved_name" || activeStatus === "invalid_name" ? "Choose another name"
                : /^[a-z0-9]{3,24}$/.test(linkName) ? "Checking" : "Use 3 to 24 letters or digits"}
            </span>}
          </div>
          <p id="create-link-help">Use 3 to 24 lowercase letters or digits. Leave it blank to use the room code.</p>
        </div>}
      </fieldset>}
      <div className="admin-actions"><Button variant="primary" type="submit" disabled={busy || !hub || (canName && workshop && !!linkName && activeStatus !== "available")}>{busy ? "Creating…" : "Create engagement"}</Button><Button href="/admin">Cancel</Button><span className="admin-meta">Everything else has a default you can change afterwards.</span></div>
    </form>
    <p className="admin-feedback" role="status" aria-live="polite">{message}{existing && <> <Link className="text-link" href={`/admin/${existing}`}>Open the existing engagement</Link></>}</p>
  </div>;
}

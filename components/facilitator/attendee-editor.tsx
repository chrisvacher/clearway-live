"use client";

import { ChevronDown, Copy, Hand, Mail, Merge, Search, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/chips";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import { Menu } from "@/components/ui/menu";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { fictionalEmail } from "@/lib/room/practice";
import { guestEmail, mergeOrder, personNameKey, type AttendeePresence, type PeopleAttendee, type PeopleData, type PeopleFilter } from "@/lib/setup/people";
import { AddPeople, type AddSource } from "./add-people";
import { JoiningEditor, type Joining } from "./joining-editor";
import { PeoplePanel } from "./people-panel";
import { setupRequest } from "./setup-editor";

const columns = [
  { id: "name", label: "Name" }, { id: "email", label: "Email" }, { id: "method", label: "How they joined" },
  { id: "now", label: "Now" }, { id: "role", label: "Role" }, { id: "actions", label: "Actions", className: "people-row-actions" },
];
const filterDefinitions = [
  ["all", "All"], ["in-the-room", "In the room"], ["invited", "Invited, not joined"], ["duplicates", "Possible duplicates"],
] as const;
const sources = { person: "One person", paste: "Paste a list", csv: "CSV", hub: "From Team Hub" } as const;
const roleLabel = { participant: "Participant", scribe: "Scribe" } as const;

type Panel = { kind: "add"; source: AddSource } | { kind: "waiting" } | { kind: "edit" | "manual"; attendee: PeopleAttendee };
type Confirmation = { kind: "remove" | "merge"; attendees: PeopleAttendee[] };
const hasEmail = (attendee: PeopleAttendee) => Boolean(attendee.email) && !fictionalEmail(attendee.email);
const withoutEmail = (attendee: PeopleAttendee) => !attendee.email || guestEmail(attendee.email);

function clock(value: string, zone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value;
  return `${part("hour")}:${part("minute")} ${part("dayPeriod") === "AM" ? "a.m." : "p.m."}`;
}

function Now({ status, zone, invited }: { status?: AttendeePresence; zone: string; invited: boolean }) {
  if (status?.present) return <StatusChip compact tone="success">In the room</StatusChip>;
  if (status?.last_seen_at) return <StatusChip compact>Left {clock(status.last_seen_at, zone)}</StatusChip>;
  if (invited) return <StatusChip compact tone="info">Invited</StatusChip>;
  return <StatusChip compact>Not joined</StatusChip>;
}

export function AttendeeEditor({ data, joining, admin, church, zone, linked, initialFilter }: {
  data: PeopleData;
  joining: Joining;
  admin: boolean;
  church: string;
  zone: string;
  linked: boolean;
  initialFilter: PeopleFilter;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState("people");
  const [filter, setFilter] = useState<PeopleFilter>(initialFilter);
  const [open, setOpen] = useState(joining.openJoin);
  const [query, setQuery] = useState("");
  const [selected, select] = useState<string[]>([]);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invited, setInvited] = useState<string[]>([]);
  const [pendingGone, setPendingGone] = useState<string[]>([]);
  const inviteRequests = useRef(new Map<string, string>());
  const access = useRef<{ leave: (continueNavigation: () => void) => void }>(null);
  const inFlight = useRef(false);
  const { id, closed } = joining;

  useEffect(() => {
    if (tab !== "people") return;
    const refresh = () => {
      if (document.visibilityState === "visible") startTransition(() => router.refresh());
    };
    const timer = window.setInterval(refresh, 5000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [router, tab]);

  const people = data.attendees.filter(attendee => !pendingGone.includes(attendee.id));
  const status = new Map(data.presence.map(item => [item.attendee_id, item]));
  const nameCounts = new Map<string, number>();
  for (const person of people) {
    if (!withoutEmail(person)) continue;
    const key = personNameKey(person.name);
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const sameName = (person: PeopleAttendee) => withoutEmail(person) ? nameCounts.get(personNameKey(person.name)) ?? 0 : 0;
  const isInvited = (person: PeopleAttendee) => Boolean(status.get(person.id)?.invited || invited.includes(person.id));
  const groups = {
    all: people,
    "in-the-room": people.filter(person => status.get(person.id)?.present),
    invited: people.filter(person => isInvited(person) && !status.get(person.id)?.present && !status.get(person.id)?.last_seen_at),
    duplicates: people.filter(person => sameName(person) > 1),
  };
  const visible = groups[filter].filter(person => `${person.name} ${withoutEmail(person) ? "" : person.email}`.toLowerCase().includes(query.trim().toLowerCase()));
  const chosen = people.filter(person => selected.includes(person.id)).sort(mergeOrder);
  const canUpdateSelection = chosen.length <= 500;
  const canMerge = data.mergeAvailable && canUpdateSelection && chosen.length > 1 && chosen.every(person => withoutEmail(person) && person.room_role === "participant"
    && person.id !== data.teamFacilitator && personNameKey(person.name) === personNameKey(chosen[0].name));
  const canInvite = !closed && chosen.some(hasEmail);
  const waiting = !open && !closed ? data.requests : [];

  function refresh() {
    router.refresh();
  }

  async function act(work: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setError("");
    setBusy(true);
    try { await work(); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Please try again."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function request(as: "door" | "people", body: Record<string, unknown>) {
    const response = await fetch(`/api/facilitator/${id}/${as}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const result = await response.json() as { ok?: boolean; message?: string; removed?: { id: string; updated_at: string }[] };
    if (!response.ok || !result.ok) throw new Error(result.message || "Couldn’t save that. Check the details and try again.");
    return result;
  }

  async function sendInvites(people: PeopleAttendee[]) {
    const ids = people.filter(hasEmail).map(person => person.id).sort();
    if (!ids.length || ids.length > 50) throw new Error("Choose up to 50 people with an email.");
    const key = ids.join(",");
    const batch = inviteRequests.current.get(key) || crypto.randomUUID();
    inviteRequests.current.set(key, batch);
    const result = await setupRequest({ action: "invite", id, batch, attendees: ids });
    inviteRequests.current.delete(key);
    setInvited(current => [...new Set([...current, ...ids])]);
    select([]);
    toast(`Sent ${result.count} ${result.count === 1 ? "invite" : "invites"}`);
    refresh();
  }

  async function admit(requests: typeof waiting, approve: boolean) {
    const results = await Promise.allSettled(requests.map(row => request("door", { action: approve ? "approve" : "decline", request: row.id })));
    refresh();
    if (results.some(result => result.status === "rejected")) throw new Error("Some requests couldn’t be changed. Review who is still waiting.");
    toast(approve ? `Let ${requests.length === 1 ? "one person" : `${requests.length} people`} in` : "Request declined");
    if (requests.length === waiting.length) setPanel(null);
  }

  async function confirmAction() {
    if (!confirm) return;
    const ids = confirm.attendees.map(person => person.id);
    if (confirm.kind === "merge") {
      await request("people", { action: "merge", keep: ids[0], attendees: ids.slice(1) });
      setPendingGone(old => [...old, ...ids.slice(1)]);
      toast("People merged");
    } else {
      const result = data.changesAvailable ? await request("people", { action: "remove", attendees: ids }) : null;
      if (!result) {
        const outcomes = await Promise.allSettled(ids.map(attendee => setupRequest({ action: "remove_attendee", id, attendee })));
        refresh();
        if (outcomes.some(outcome => outcome.status === "rejected")) throw new Error("Some people couldn’t be removed. Check the list and try again.");
      }
      setPendingGone(old => [...old, ...ids]);
      const removed = result?.removed;
      toast(ids.length === 1 ? "Person removed" : "People removed", removed ? { action: { label: "Undo", onClick: async () => {
        await request("people", { action: "restore", attendees: removed });
        setPendingGone(old => old.filter(value => !ids.includes(value)));
        refresh();
      } } } : undefined);
    }
    select([]);
    setConfirm(null);
    refresh();
  }

  async function changeRole(role: PeopleAttendee["room_role"]) {
    await request("people", { action: "role", role, attendees: chosen.map(person => person.id) });
    select([]);
    toast("Role changed");
    refresh();
  }

  async function savePerson(event: FormEvent<HTMLFormElement>, person: PeopleAttendee) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await act(async () => {
      await setupRequest({ action: "edit_attendee", id, attendee: person.id,
        person: { name: values.get("name"), email: values.get("email") || person.email, role_at_church: values.get("role_at_church"), room_role: values.get("room_role") } });
      setPanel(null);
      toast("Person saved");
      refresh();
    });
  }

  return <main id="main" className="admin-page people-page">
    <PageHeader kicker={church} title="People" lead="Who’s coming, who’s in the room now, and how they get in."
      primary={<div className="people-add-split">
        <Button variant="primary" disabled={closed} onClick={() => setPanel({ kind: "add", source: "person" })}><UserPlus aria-hidden="true" />Add people</Button>
        {!closed && <Menu label="Choose how to add people" trigger={<ChevronDown aria-hidden="true" />}
          items={(Object.entries(sources) as [AddSource, string][]).map(([source, label]) => ({ label, disabled: source === "hub" && !linked, onSelect: () => setPanel({ kind: "add", source }) }))} />}
      </div>} />
    <Tabs label="People and access" items={[{ id: "people", label: "People", count: people.length }, { id: "access", label: "Access" }]} value={tab}
      onChange={value => tab === "access" ? access.current?.leave(() => setTab(value)) : setTab(value)} />
    <TabPanel id="people" active={tab === "people"}>
      {!!waiting.length && <div className="people-waiting" role="status">
        <Hand aria-hidden="true" size={16} /><div><strong>{waiting.length === 1 ? "1 person is" : `${waiting.length} people are`} waiting to join</strong>
          <p>{waiting.length === 1 ? "Their email isn't on the list." : "Their emails aren't on the list."}</p></div>
        <div className="people-inline"><Button size="small" onClick={() => setPanel({ kind: "waiting" })}>Review</Button>
          <Button size="small" variant="primary" disabled={busy} onClick={() => void act(() => admit(waiting, true))}>{waiting.length === 2 ? "Let both in" : waiting.length > 2 ? "Let everyone in" : "Let them in"}</Button></div>
      </div>}
      <div className="people-toolbar">
        <label className="people-search"><Search aria-hidden="true" size={16} /><input type="search" aria-label="Search people" placeholder="Search names and emails"
          value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="people-filter" aria-label="Filter people">
          {filterDefinitions.map(([key, label]) => <Button key={key} size="small" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label} <span>{groups[key].length}</span></Button>)}
        </div>
      </div>
      <DataTable label="People" columns={columns} selected={chosen.map(person => person.id)} onSelectionChange={select}
        empty={query.trim() ? "No one matches your search." : filter === "all" ? "No one is on the list yet." : "No people match this filter."}
        bulkActions={<>
          {!canUpdateSelection && <span>Choose up to 500 people to make changes.</span>}
          {canMerge && <Button size="small" disabled={busy} onClick={() => setConfirm({ kind: "merge", attendees: chosen })}><Merge aria-hidden="true" />Merge into one</Button>}
          {canInvite && <Button size="small" disabled={busy} onClick={() => void act(() => sendInvites(chosen))}><Mail aria-hidden="true" />Send invites</Button>}
          {data.changesAvailable && <Menu label="Change role" trigger={<>Change role <ChevronDown aria-hidden="true" /></>}
            items={Object.entries(roleLabel).map(([role, label]) => ({ label, disabled: busy || !canUpdateSelection, onSelect: () => void act(() => changeRole(role as PeopleAttendee["room_role"])) }))} />}
          <Button variant="danger" size="small" disabled={busy || !canUpdateSelection} onClick={() => setConfirm({ kind: "remove", attendees: chosen })}>Remove</Button>
        </>}
        rows={visible.map(person => {
          const joined = status.get(person.id);
          const same = sameName(person);
          return { id: person.id, label: person.name, cells: {
            name: <span className="people-name"><strong>{person.name}</strong>{same > 1 && <StatusChip compact tone="warning" icon={<Copy size={12} aria-hidden="true" />}>Same name {same}</StatusChip>}</span>,
            email: <span className={withoutEmail(person) ? "people-subtle" : "people-muted"}>{withoutEmail(person) ? "No email" : person.email}</span>,
            method: withoutEmail(person) ? "By name" : joined?.present || joined?.last_seen_at ? (joined.manual ? "Signed in by hand" : "Email code") : <span className="people-subtle">Not joined</span>,
            now: <Now status={joined} zone={zone} invited={isInvited(person)} />,
            role: person.id === data.teamFacilitator ? "Team facilitator" : data.facilitatorEmails.includes(person.email) ? "Co-facilitator" : roleLabel[person.room_role],
            actions: <Menu label={`Actions for ${person.name}`} items={[
              { label: "Edit", disabled: busy, onSelect: () => setPanel({ kind: "edit", attendee: person }) },
              ...(!withoutEmail(person) && !closed ? [{ label: "Sign in this device", disabled: busy, onSelect: () => setPanel({ kind: "manual", attendee: person }) }] : []),
              ...(hasEmail(person) && !closed ? [{ label: "Send invite", disabled: busy, onSelect: () => void act(() => sendInvites([person])) }] : []),
              { label: "Remove", danger: true, dividerBefore: true, disabled: busy, onSelect: () => setConfirm({ kind: "remove", attendees: [person] }) },
            ]} />,
          } };
        })} />
      {error && !panel && <p role="alert" className="people-invalid">{error}</p>}
    </TabPanel>
    <TabPanel id="access" active={tab === "access"}><JoiningEditor initial={joining} admin={admin} onJoiningChange={setOpen} navigationRef={access} /></TabPanel>
    {panel && <PeoplePanel title={panel.kind === "add" ? sources[panel.source] : panel.kind === "waiting" ? "Waiting to join" : panel.kind === "edit" ? "Edit person" : "Sign in this device"}
      onClose={() => { if (!busy) { setPanel(null); setError(""); } }}>
      {panel.kind === "add" && <AddPeople key={panel.source} id={id} busy={busy} source={panel.source} run={act}
        onSaved={message => { toast(message); setPanel(null); refresh(); }} />}
      {panel.kind === "waiting" && <ul className="plain-list">{waiting.map(row => <li key={row.id}><strong>{row.name}</strong><p>{row.email}</p>
        <div className="people-inline"><Button size="small" variant="primary" disabled={busy} onClick={() => void act(() => admit([row], true))}>Let in</Button>
          <Button size="small" disabled={busy} onClick={() => void act(() => admit([row], false))}>Decline request</Button></div>
      </li>)}</ul>}
      {panel.kind === "edit" && <form className="form-stack" onSubmit={event => void savePerson(event, panel.attendee)}>
        <label>Name<input name="name" defaultValue={panel.attendee.name} maxLength={200} required /></label>
        <label>Email<input name="email" type="email" defaultValue={withoutEmail(panel.attendee) ? "" : panel.attendee.email} maxLength={254} required={!withoutEmail(panel.attendee)} /></label>
        <label>Role at the church<input name="role_at_church" defaultValue={panel.attendee.role_at_church} maxLength={200} /></label>
        <label>Room role<Select name="room_role" defaultValue={panel.attendee.room_role}><option value="participant">Participant</option><option value="scribe">Scribe</option></Select></label>
        <p>Changing an email signs out the person’s devices. They’ll use the new email to sign in again.</p>
        {!!Object.keys(panel.attendee.extra_fields ?? {}).length && <details><summary>View additional fields</summary><dl>{Object.entries(panel.attendee.extra_fields).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></details>}
        <Button variant="primary" type="submit" disabled={busy}>Save person</Button>
      </form>}
      {panel.kind === "manual" && <form className="form-stack" onSubmit={event => {
        event.preventDefault();
        const code = new FormData(event.currentTarget).get("code");
        void act(async () => {
          await request("door", { action: "manual", attendee: panel.attendee.id, code });
          setPanel(null);
          toast("The phone will sign in automatically");
          refresh();
        });
      }}>
        <p>Sign in {panel.attendee.name} with the code shown on their phone.</p>
        <label>Device code on their phone<input name="code" autoComplete="off" required maxLength={9} pattern="[A-HJ-NP-Za-hj-np-z2-9 ]{8,9}" /></label>
        <Button variant="primary" type="submit" disabled={busy}>Sign in this device</Button>
      </form>}
      {error && <p role="alert" className="people-invalid">{error}</p>}
    </PeoplePanel>}
    <ConfirmDialog open={Boolean(confirm)} title={confirm?.kind === "merge" ? "Merge these people?" : confirm?.attendees.length === 1 ? `Remove ${confirm.attendees[0].name}?` : "Remove these people?"}
      description={confirm?.kind === "merge" ? "The earliest entry keeps their answers and signed-in devices." : "Their signed-in devices lose access. Answers stay with the engagement."}
      cancelLabel="Cancel" confirmLabel={confirm?.kind === "merge" ? "Merge into one" : "Remove"} busy={busy} onCancel={() => setConfirm(null)}
      onConfirm={() => void act(confirmAction)} />
  </main>;
}

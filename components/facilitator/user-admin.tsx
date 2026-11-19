"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { Menu } from "@/components/ui/menu";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import type { Member } from "@/lib/setup/types";
import { formatInZone } from "@/lib/time/format";

export type ClearwayUser = { id: string; name: string; email: string; is_admin: boolean; last_sign_in_at?: string | null };
type Change = "make_admin" | "make_facilitator" | "remove";

async function request(url: string, body: Record<string, string>) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok || (result.status !== "ok" && !result.ok)) {
    throw new Error(result.message || (result.status === "last_admin" ? "Keep at least one Clearway admin." : "We couldn't finish that. Please try again."));
  }
  return result;
}

export function UserAdmin({ configured, users, canManage, loadFailed, profileId }: {
  configured: boolean;
  users: ClearwayUser[];
  canManage?: boolean;
  loadFailed?: boolean;
  profileId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [member, setMember] = useState("");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<ClearwayUser | null>(null);
  const signInAvailable = users.some(person => person.last_sign_in_at !== undefined);

  async function load() {
    setLoading(true); setFailed("");
    try { setMembers((await request("/api/setup", { action: "hub_members" })).members); }
    catch (error) { setFailed(error instanceof Error ? error.message : "We couldn't connect to Team Hub."); }
    finally { setLoading(false); }
  }

  function showPicker() {
    setOpen(true);
    if (configured && !members && !loading) void load();
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!member || busy) return;
    setBusy(true); setFailed("");
    try {
      await request("/api/setup", { action: "add_clearway_user", member });
      toast("Clearway user added");
      setMember(""); setOpen(false); router.refresh();
    } catch (error) { setFailed(error instanceof Error ? error.message : "We couldn't add that person."); }
    finally { setBusy(false); }
  }

  async function change(user: ClearwayUser, action: Change) {
    setBusy(true);
    try {
      await request("/api/admin/users", { action, user: user.id });
      setRemoving(null);
      toast(action === "remove" ? "Access removed" : "Role changed");
      if (action === "remove" && user.id === profileId) router.replace("/sign-in");
      else if (action === "make_facilitator" && user.id === profileId) router.replace("/admin");
      else router.refresh();
    } catch (error) { toast(error instanceof Error ? error.message : "We couldn't change access."); }
    finally { setBusy(false); }
  }

  const columns: DataColumn[] = [
    { id: "name", label: "Name" }, { id: "email", label: "Email" }, { id: "role", label: "Role" },
    ...(signInAvailable ? [{ id: "signIn", label: "Last sign-in" }] : []),
    ...(canManage ? [{ id: "actions", label: "Actions", align: "end" as const }] : []),
  ];

  return <main id="main" className="admin-page cwl-g-users">
    <PageHeader kicker="Clearway admin" title="Clearway users" lead="Who can prepare and facilitate engagements."
      primary={<Button variant="primary" onClick={showPicker}><UserPlus aria-hidden="true" />Add a Clearway user</Button>} />
    <DataTable label="People with access" columns={columns}
      empty={<p role="status">{loadFailed ? "We couldn't load Clearway users. Please try again." : "No Clearway users yet."}</p>}
      rows={users.map(user => ({ id: user.id, cells: {
        name: <strong>{user.name}</strong>,
        email: user.email,
        role: user.is_admin ? "Admin" : "Facilitator",
        signIn: user.last_sign_in_at ? formatInZone(user.last_sign_in_at, "America/Toronto") : "Never signed in",
        actions: canManage && <Menu label={`Actions for ${user.name}`} items={[
          { label: user.is_admin ? "Make facilitator" : "Make admin", disabled: busy, onSelect: () => void change(user, user.is_admin ? "make_facilitator" : "make_admin") },
          { label: "Remove access", danger: true, disabled: busy, onSelect: () => setRemoving(user) },
        ]} />,
      } }))} />
    <Dialog open={open} onClose={() => { if (!busy) setOpen(false); }} label="Add a Clearway user" className="cwl-g-user-panel">
      <header className="cwl-g-section-head">
        <h2>Add a Clearway user</h2>
        <Button iconOnly aria-label="Close user picker" variant="quiet" onClick={() => setOpen(false)} disabled={busy} data-initial-focus><X aria-hidden="true" /></Button>
      </header>
      <p>Choose a Team Hub team member with a Clearway email.</p>
      {!configured ? <p>The Team Hub connection is unavailable. Please try again later.</p> :
        <form onSubmit={add} className="form-stack">
          {loading ? <div className="cwl-g-skeleton" aria-label="Loading team members" aria-busy="true"><span /><span /><span /></div> :
            <Combobox label="Team member" value={member} onChange={setMember}
              options={(members ?? []).map(person => ({ value: person.id, label: person.name, detail: person.email }))}
              placeholder="Find a team member" disabled={busy || !members?.length} />}
          {failed && <p role="alert">{failed} {!members && <Button size="small" onClick={() => void load()}>Try again</Button>}</p>}
          {!loading && !failed && members?.length === 0 && <p>No Clearway team members were found.</p>}
          <Button type="submit" variant="primary" disabled={busy || loading || !member}>Add Clearway user</Button>
        </form>}
    </Dialog>
    <ConfirmDialog open={Boolean(removing)} title={`Remove access for ${removing?.name ?? "this person"}?`}
      description="They lose access to Clearway Live. Engagements and their answers stay available."
      confirmLabel="Remove access" busy={busy} onCancel={() => setRemoving(null)}
      onConfirm={() => { if (removing) void change(removing, "remove"); }} />
  </main>;
}

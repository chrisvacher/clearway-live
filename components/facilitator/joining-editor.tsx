"use client";

import { Check, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, SettingsCard, SettingsSection } from "@/components/ui/settings";
import { SaveBar } from "@/components/ui/save-bar";
import { useToast } from "@/components/ui/toast";
import { useDirtyForm } from "@/hooks/use-dirty-form";
import { setupRequest } from "./setup-editor";

export type Joining = {
  id: string; type: string; roomCode: string; linkName: string | null; host: string; origin: string;
  openJoin: boolean; neutral: boolean; how: string; closed: boolean;
  adminLink: { url: string | null } | null;
};

const labels = { name: "Link name", how: "How the room decides" };
const invalidName = (name: string) => name !== "" && (!/^[a-z0-9]{3,24}$/.test(name) || /^[a-f0-9]{8}$/.test(name));
type Availability = { name: string; state: "available" | "taken" | "reserved" | "unchecked" };

function LinkName({ id, "aria-describedby": describedBy, value, host, onChange }: {
  id?: string; "aria-describedby"?: string; value: string; host: string; onChange: (name: string) => void;
}) {
  return <div className="people-link-name"><span aria-hidden="true">{host}/</span>
    <input id={id} aria-describedby={describedBy} value={value} autoCapitalize="none" autoComplete="off" spellCheck={false} maxLength={24}
      onChange={e => onChange(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))} />
  </div>;
}

export function JoiningEditor({ initial, admin, onJoiningChange, navigationRef }: {
  initial: Joining;
  admin: boolean;
  onJoiningChange: (open: boolean) => void;
  navigationRef: Ref<{ leave: (continueNavigation: () => void) => void }>;
}) {
  const router = useRouter();
  const toast = useToast();
  const form = useDirtyForm({ name: initial.linkName ?? "", how: initial.how });
  useImperativeHandle(navigationRef, () => ({ leave: form.guardNavigation }), [form.guardNavigation]);
  const [options, setOptions] = useState({ open: initial.openJoin, neutral: initial.neutral });
  const [savedName, setSavedName] = useState(initial.linkName);
  const [code, setCode] = useState(initial.roomCode);
  const [adminLink, setAdminLink] = useState(initial.adminLink);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [confirm, setConfirm] = useState<"code" | "admin" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const draftName = form.values.name;
  const checked = availability?.name === draftName ? availability.state : null;
  const canChangeJoining = admin && initial.type === "team_workshop";
  const link = `${initial.origin}/${savedName || code}`;

  useEffect(() => {
    if (!draftName || draftName === savedName || invalidName(draftName)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/setup/engagement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "link_name", id: initial.id, name: draftName }),
          signal: controller.signal,
        });
        const result = response.ok ? await response.json() as { status?: string } : null;
        const state = result?.status === "available" ? "available"
          : result?.status === "taken_name" ? "taken"
          : result?.status === "reserved_name" ? "reserved" : "unchecked";
        if (!controller.signal.aborted) setAvailability({ name: draftName, state });
      } catch {
        if (!controller.signal.aborted) setAvailability({ name: draftName, state: "unchecked" });
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [draftName, initial.id, savedName]);

  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try { await action(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function save() {
    if (inFlight.current) return;
    inFlight.current = true;
    setMessage("");
    try {
      await form.save(async (values, fields) => {
        if (fields.includes("name") && invalidName(values.name)) throw new Error("Use 3 to 24 letters or numbers. A name can’t look like a room code.");
        if (fields.includes("how") && !values.how.trim()) throw new Error("Explain how the room decides.");
        const result = await setupRequest({ action: "joining_save", id: initial.id,
          ...(fields.includes("name") ? { link_name: values.name } : {}),
          ...(fields.includes("how") ? { how_the_room_decides: values.how } : {}),
        });
        setSavedName(result.link_name ?? null);
        if (result.room_code) setCode(result.room_code);
        router.refresh();
      });
    } finally { inFlight.current = false; }
  }

  async function setChoice(option: "open" | "neutral", value: boolean, undo = false) {
    const previous = options[option];
    const key = option === "open" ? "open_join" : "neutral_join_message";
    await setupRequest({ action: "joining_save", id: initial.id, [key]: value });
    setOptions(current => ({ ...current, [option]: value }));
    if (option === "open") onJoiningChange(value);
    if (!undo) toast("Joining settings saved", { action: { label: "Undo", onClick: () => run(() => setChoice(option, previous, true)) } });
    router.refresh();
  }

  async function copy(value: string, text: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast(text);
    } catch { setMessage("Copying isn’t available in this browser."); }
  }

  async function makeAdminLink(action: "create" | "cycle") {
    const response = await fetch(`/api/facilitator/${initial.id}/event-link`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    });
    const result = await response.json() as { ok?: boolean; url?: string };
    if (!response.ok || !result.ok || !result.url) throw new Error("Couldn’t make the admin link. Try again.");
    setAdminLink({ url: result.url });
    toast("Admin link ready");
    setConfirm(null);
  }

  return <div className="people-access">
    <SettingsCard>
      <SettingsSection title="The link" description="Where people go on their phone or laptop. The room code always works too.">
        <Field label="Link name" wide dirty={form.dirtyFields.includes("name")} help={
          checked === "available" ? <span className="people-available"><Check size={16} aria-hidden="true" />Available</span>
          : checked === "taken" ? <span className="people-invalid">Taken</span>
          : checked === "reserved" ? <span className="people-invalid">That name is used by the app. Choose another.</span>
          : "Optional. Use 3 to 24 letters or numbers."}>
          <LinkName host={initial.host} value={draftName} onChange={name => form.set("name", name)} />
        </Field>
        <div className="people-settings-wide people-inline"><a href={link} target="_blank" rel="noreferrer">{link.replace(/^https?:\/\//, "")}</a>
          <Button size="small" onClick={() => void copy(link, `Link copied: ${link.replace(/^https?:\/\//, "")}`)}><Copy aria-hidden="true" />Copy link</Button>
        </div>
        <div className="people-settings-wide people-inline"><span>Room code <strong className="invite-code">{code}</strong></span>
          <Button size="small" disabled={busy || form.saving || initial.closed || initial.type === "practice"} onClick={() => setConfirm("code")}>Make a new code</Button>
        </div>
      </SettingsSection>
      <SettingsSection title="Who can join" description={!canChangeJoining && initial.type === "team_workshop" ? "Only an admin can change who can join." : undefined}>
        <fieldset className="people-settings-wide people-choice">
          <legend className="sr-only">Who can join</legend>
          <label className={options.open ? "is-on" : undefined}><input type="radio" name="room-access" checked={options.open} disabled={!canChangeJoining || busy || form.saving} onChange={() => void run(() => setChoice("open", true))} />
            <span><strong>Anyone who has the link or code</strong><span>They type their name and they&apos;re in. No email, no list.</span></span>
          </label>
          <label className={!options.open ? "is-on" : undefined}><input type="radio" name="room-access" checked={!options.open} disabled={!canChangeJoining || busy || form.saving} onChange={() => void run(() => setChoice("open", false))} />
            <span><strong>Only people on your list</strong><span>They enter their email and get a sign-in code. Emails not on the list ask to join, and you let them in from People.</span></span>
          </label>
        </fieldset>
        {!options.open && <label className="people-settings-wide check-row"><input type="checkbox" checked={options.neutral} disabled={busy || form.saving}
          onChange={event => void run(() => setChoice("neutral", event.target.checked))} />Say “Check with your facilitator” to emails not on the list</label>}
      </SettingsSection>
      <SettingsSection title="How the room decides" description="Shown on the join page and in invites.">
        <Field label="How the room decides" wide dirty={form.dirtyFields.includes("how")}>
          <textarea value={form.values.how} rows={4} maxLength={4000} onChange={event => form.set("how", event.target.value)} />
        </Field>
      </SettingsSection>
      {adminLink && <SettingsSection title="Admin link" description="Anyone with this link can run this event without signing in: the run of show, the live room, people and results. Send it only to people who should have that.">
        {adminLink.url ? <>
          <Field label="Admin link" wide><input readOnly value={adminLink.url} /></Field>
          <div className="people-settings-wide people-inline"><Button size="small" onClick={() => void copy(adminLink.url!, "Admin link copied")}><Copy aria-hidden="true" />Copy link</Button>
            <Button size="small" disabled={busy || form.saving} onClick={() => setConfirm("admin")}>Make a new link</Button>
          </div>
        </> : <Button size="small" disabled={busy || form.saving} onClick={() => void run(() => makeAdminLink("create"))}>Make an admin link</Button>}
      </SettingsSection>}
    </SettingsCard>
    {message && <p role="alert" className="people-invalid">{message}</p>}
    <SaveBar dirtyFields={form.dirtyFields} labels={labels} onDiscard={form.discard} onSave={save} error={form.error}
      saving={form.saving || busy} confirmation={form.confirmation} />
    <ConfirmDialog open={confirm !== null} title={confirm === "admin" ? "Make a new admin link?" : "Make a new room code?"}
      description={confirm === "admin" ? "The old link stops working and anyone using it loses access." : "The old code and any printed QR code stop working. The link name keeps working."}
      confirmLabel={confirm === "admin" ? "Make a new link" : "Make a new code"} busy={busy}
      onCancel={() => setConfirm(null)} onConfirm={() => void run(async () => {
        if (confirm === "admin") return makeAdminLink("cycle");
        const result = await setupRequest({ action: "room_code_renew", id: initial.id });
        setCode(result.room_code);
        setConfirm(null);
        toast("New room code ready");
        router.refresh();
      })} />
  </div>;
}

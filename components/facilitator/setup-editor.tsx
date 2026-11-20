"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { PowerOff, RefreshCw, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { StageChip } from "@/components/ui/chips";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { SaveBar } from "@/components/ui/save-bar";
import { DangerZone, Field, SettingsCard, SettingsSection } from "@/components/ui/settings";
import { useToast } from "@/components/ui/toast";
import { AiIcon } from "@/components/interactions/ai/ai-icon";
import { useDirtyForm } from "@/hooks/use-dirty-form";
import { practiceId } from "@/lib/room/practice";
import { detailsChurchFields, detailsLabels, detailsValues, lensFields, type DetailsField } from "@/lib/setup/details";
import { typeName } from "@/lib/setup/listing";
import { logoMaxBytes } from "@/lib/setup/logo";
import { localTime } from "@/lib/setup/policy";
import type { Stage, StageChoice } from "@/lib/setup/stage";
import { detailsTimeZones } from "@/lib/setup/timezones";
import type { Member, SetupForm } from "@/lib/setup/types";
import type { HubClient, HubElement, HubEvent } from "@/lib/team-hub/reader";
import { BrandField } from "./brand-field";

async function post(endpoint: string, body: Record<string, unknown>) {
  const response = await fetch(endpoint, {
    method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw Object.assign(new Error(result.message || "We couldn’t finish that. Please try again."), { existingId: result.existing_id });
  }
  return result;
}

export const setupRequest = (body: Record<string, unknown>) => post("/api/setup", body);

type DialogAction = "close" | "archive" | "reset" | "end" | "stage_close";
type Planned = { elements: HubElement[]; events: HubEvent[] };
type Immediate = { brand: string; ai: boolean };
const churchFields = new Set<DetailsField>(detailsChurchFields);

function previewableLogo(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname));
  } catch { return false; }
}

export function SetupEditor({ id, initial, members, admin, hubConfigured, canSaveMixedDetails, canChangeFacilitators, stage, archiveAvailable, archived, now }: {
  id: string;
  initial: SetupForm;
  members: Member[];
  admin: boolean;
  hubConfigured: boolean;
  canSaveMixedDetails: boolean;
  canChangeFacilitators: boolean;
  stage: Stage;
  archiveAvailable: boolean;
  archived: boolean;
  now: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const form = useDirtyForm(detailsValues(initial));
  const { values, set, dirtyFields } = form;
  const [immediate, setImmediate] = useState<Immediate>({
    brand: initial.engagement.skin ?? "clearway",
    ai: initial.engagement.settings.ai_enabled,
  });
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const commitVersions = useRef({ brand: 0, ai: 0 });
  const [dialog, setDialog] = useState<DialogAction | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [planned, setPlanned] = useState<Planned | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showAddress, setShowAddress] = useState(false);
  const [broken, setBroken] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const wayfinding = initial.engagement.type !== "team_workshop";
  const closed = initial.engagement.status === "closed";
  const zones = useMemo(() => detailsTimeZones(initial.church.timezone, now), [initial.church.timezone, now]);
  const disabled = busy || form.saving;
  const eventEditsLocked = !canSaveMixedDetails && (busy || uploading || dirtyFields.some(key => churchFields.has(key)));
  const churchEditsLocked = !canSaveMixedDetails && dirtyFields.some(key => !churchFields.has(key));
  const fieldLocked = (key: DetailsField) => churchFields.has(key) ? churchEditsLocked : eventEditsLocked;

  function textField(key: DetailsField, type = "text", options: { wide?: boolean; help?: string; required?: boolean } = {}) {
    return <Field key={key} label={detailsLabels[key]} dirty={dirtyFields.includes(key)} wide={options.wide} help={options.help}>
      <input type={type} value={values[key]} required={options.required} disabled={fieldLocked(key)} onChange={event => set(key, event.target.value)} />
    </Field>;
  }

  function selectField(key: "lead" | "co") {
    if (!canChangeFacilitators || (key === "lead" && !admin)) {
      const person = members.find(member => member.id === values[key]);
      return <Field label={detailsLabels[key]}><input value={person?.name ?? (key === "co" ? "None" : "Unassigned")} readOnly /></Field>;
    }
    return <Field label={detailsLabels[key]} dirty={dirtyFields.includes(key)}>
      <select value={values[key]} onChange={event => set(key, event.target.value)}>
        <option value="">{key === "co" ? "None" : "Choose a facilitator"}</option>
        {members.filter(member => key === "lead" || member.id !== values.lead).map(member =>
          <option key={member.id} value={member.id}>{member.name}</option>)}
      </select>
    </Field>;
  }

  async function perform(task: () => Promise<void>) {
    if (inFlight.current || form.saving) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try { await task(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Please try again."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  function save() {
    if (inFlight.current || uploading || dialog) return;
    if (!dirtyFields.length) return;
    setError("");
    setNotice("");
    inFlight.current = true;
    void form.save(async (candidate, fields) => {
      const changes = Object.fromEntries(fields.map(key => [key, candidate[key]]));
      const result = await post("/api/setup/details", { id, action: "fields", fields: changes });
      router.refresh();
      return { ...candidate, ...result.values };
    }).finally(() => { inFlight.current = false; });
  }

  async function saveImmediate<K extends keyof Immediate>(key: K, value: Immediate[K], previous: Immediate[K]) {
    setImmediate(current => ({ ...current, [key]: value }));
    try {
      await post("/api/setup/details", { id, action: key, value });
    } catch (cause) {
      setImmediate(current => ({ ...current, [key]: previous }));
      throw cause;
    }
  }

  function updateNow<K extends keyof Immediate>(key: K, value: Immediate[K]) {
    const previous = immediate[key];
    if (previous === value) return;
    void perform(async () => {
      await saveImmediate(key, value, previous);
      const version = ++commitVersions.current[key];
      const message = key === "brand" ? `Brand changed to ${value === "novetera" ? "Novetera" : "Clearway"}`
        : value ? "AI is on in live sessions" : "AI is off in live sessions";
      router.refresh();
      toast(message, {
        action: { label: "Undo", onClick: async () => {
          if (commitVersions.current[key] !== version) return;
          let undone = false;
          await perform(async () => {
            await saveImmediate(key, previous, value);
            commitVersions.current[key]++;
            router.refresh();
            undone = true;
          });
          if (!undone) throw new Error("We couldn’t undo that change.");
        } },
      });
    });
  }

  function selectStage(choice: StageChoice) {
    if (disabled) return;
    if (choice.stage === "done") { setDialog("end"); return; }
    if (choice.status === "closed") { setDialog("stage_close"); return; }
    void perform(async () => {
      if (wayfinding) await post("/api/setup/engagement", { id, action: "stage", status: choice.status });
      else await setupRequest({ id, action: "reopen_workshop" });
      toast(wayfinding ? "Stage changed" : "Workshop reopened");
      router.refresh();
    });
  }

  function confirm() {
    if (!dialog) return;
    void perform(async () => {
      if (dialog === "archive") {
        await post("/api/setup/engagement", { id, action: "archive" });
        toast("Engagement archived");
        form.guardNavigation(() => router.push("/admin"));
      } else if (dialog === "reset") {
        await setupRequest({ id, action: "reset_practice" });
        toast("Practice room reset");
      } else if (wayfinding) {
        await post("/api/setup/engagement", { id, action: "stage", status: "closed" });
        toast("Engagement closed");
      } else {
        await setupRequest({ id, action: "end_workshop" });
        toast("Workshop ended");
      }
      setDialog(null);
      router.refresh();
    });
  }

  async function upload(file: File | undefined) {
    if (!file || uploading || disabled || churchEditsLocked) return;
    if (file.size > logoMaxBytes) {
      setError("Use a logo that is 1 MB or smaller.");
      return;
    }
    setUploading(true);
    setError("");
    setNotice("");
    try {
      const body = new FormData();
      body.set("id", id);
      body.set("file", file);
      const response = await fetch("/api/setup/logo", { method: "POST", cache: "no-store", body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.message || "We couldn’t upload that logo. Please try again.");
      set("logo_url", result.url);
      setBroken("");
      setNotice("Logo ready. Save to keep it.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn’t upload that logo. Please try again."); }
    finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function refreshFromHub() {
    if (churchEditsLocked) return;
    void perform(async () => {
      const result = await setupRequest({ action: "hub_refresh", id }) as Planned & { client: HubClient | null };
      setPlanned({ elements: result.elements, events: result.events });
      if (result.client) {
        set("name", result.client.name);
        if (result.client.timezone) set("timezone", result.client.timezone);
        if (result.client.logo) set("logo_url", result.client.logo);
      }
      setNotice("Church details refreshed. Review and save your changes.");
    });
  }

  const dangerActions = [
    { title: "Close this engagement", description: "Ends every device sign-in. Reopening asks people to sign in again.",
      action: <Button size="small" variant="danger" disabled={closed || disabled} onClick={() => setDialog("close")}><PowerOff size={16} aria-hidden="true" />Close engagement</Button> },
    ...(archiveAvailable && !archived ? [{ title: "Archive", description: "Hides it from Engagements. Answers and results are kept.",
      action: <Button size="small" variant="danger" disabled={disabled} onClick={() => setDialog("archive")}><Trash2 size={16} aria-hidden="true" />Archive</Button> }] : []),
    ...(id === practiceId ? [{ title: "Reset the practice room", description: "Signs out practice phones and clears the guest list. Riverside’s fictional team stays.",
      action: <Button size="small" variant="danger" disabled={disabled} onClick={() => setDialog("reset")}>Reset practice room</Button> }] : []),
  ];
  const confirmations = {
    close: ["Close this engagement?", "Ends every device sign-in. Reopening asks people to sign in again.", "Close engagement"],
    stage_close: ["Close this engagement?", "Ends every device sign-in. Reopening asks people to sign in again.", "Close engagement"],
    archive: ["Archive this engagement?", "Hides it from Engagements. Answers and results are kept. Find it under Archived to restore it.", "Archive"],
    reset: ["Reset the practice room?", "This signs out practice phones and clears the guest list. Riverside’s fictional team stays in place.", "Reset practice room"],
    end: ["End the workshop?", "Phones are signed out and answers close. Results stay here to read and download. If you reopen it, people sign in again.", "End the workshop"],
  } as const;
  const [question, consequence, actionLabel] = confirmations[dialog ?? "close"];
  const logo = values.logo_url;
  const showLogo = logo !== broken && previewableLogo(logo);

  return <>
    <PageHeader kicker={initial.church.name} title="Details" lead="The event, the church and how AI works in the room."
      stage={<StageChip stage={stage} type={initial.engagement.type} interactive onStageChange={selectStage} />} />
    {!canSaveMixedDetails && <p className="cwl-c-feedback">Save event and church changes separately.</p>}
    <form className="cwl-c-details-form" onSubmit={event => { event.preventDefault(); save(); }}>
      <SettingsCard>
        <SettingsSection title="The event" description="What it is, when, and who leads it. The stage is set from the page header.">
          {textField("title", "text", { wide: true, required: true })}
          <div className="cwl-ui-field">
            <label htmlFor="details-kind">Kind of event</label>
            <div className="cwl-c-locked-kind">
              <input id="details-kind" value={typeName(initial.engagement.type)} readOnly aria-describedby="details-kind-help" />
              <small id="details-kind-help">Set when created</small>
            </div>
          </div>
          <BrandField id="details-brand" value={immediate.brand} onChange={value => updateNow("brand", value)} admin={admin} disabled={disabled} />
          {textField("start_date", "date")}
          <div className="cwl-ui-field" data-dirty={dirtyFields.includes("end_date") || undefined}>
            <label htmlFor="details-ends">Ends</label>
            <div className="cwl-c-date" data-empty={!values.end_date || undefined}>
              <input id="details-ends" type="date" value={values.end_date} disabled={eventEditsLocked} aria-describedby={values.end_date ? undefined : "details-same-day"}
                onChange={event => set("end_date", event.target.value)} />
              {!values.end_date && <span id="details-same-day">Same day</span>}
            </div>
          </div>
          {selectField("lead")}
          {selectField("co")}
        </SettingsSection>
        <SettingsSection title="The church" description={<>
          <div>Shown on the TV, phones and invites.{initial.hub_client && ` Linked to Team Hub: ${initial.church.name}.`}</div>
          {initial.hub_client && <Button className="cwl-c-refresh" variant="quiet" size="small" disabled={disabled || !hubConfigured || churchEditsLocked} onClick={refreshFromHub}><RefreshCw size={14} aria-hidden="true" />Refresh from Team Hub</Button>}
        </>}>
          <div className="cwl-ui-field is-wide" data-dirty={dirtyFields.includes("logo_url") || undefined}>
            <strong className="cwl-c-field-title">Logo</strong>
            <div className="cwl-c-logo-row" onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = churchEditsLocked ? "none" : "copy"; }}
              onDrop={event => { event.preventDefault(); void upload(event.dataTransfer.files[0]); }}>
              <div className="cwl-c-logo-tile">
                {showLogo ? <Image unoptimized src={logo} alt="Church logo preview" width={64} height={64} onError={() => setBroken(logo)} />
                  : <span>{logo ? "No preview" : "No logo"}</span>}
              </div>
              <div>
                <div className="cwl-c-logo-actions">
                  <Button size="small" disabled={disabled || uploading || churchEditsLocked} onClick={() => fileInput.current?.click()}>{uploading ? "Uploading…" : logo ? "Replace" : "Add logo"}</Button>
                  {logo && <Button size="small" disabled={disabled || uploading || churchEditsLocked} onClick={() => { set("logo_url", ""); setNotice(""); }}>Remove</Button>}
                </div>
                <input ref={fileInput} type="file" hidden disabled={churchEditsLocked} aria-label="Logo file" accept="image/png,image/jpeg,image/webp"
                  onChange={event => void upload(event.target.files?.[0])} />
                <div className="cwl-ui-field-help">PNG, JPEG or WebP, up to 1 MB. Drop a file here.</div>
                <Button variant="quiet" size="small" disabled={churchEditsLocked} aria-expanded={showAddress} onClick={() => setShowAddress(!showAddress)}>Paste an address instead</Button>
              </div>
            </div>
            {showAddress && <Field label="Logo address"><input type="url" value={logo} disabled={churchEditsLocked} onChange={event => set("logo_url", event.target.value)} /></Field>}
          </div>
          {textField("name", "text", { required: true })}
          <Field label="Time zone" dirty={dirtyFields.includes("timezone")}>
            <Combobox label="Time zone" value={values.timezone} options={zones} disabled={churchEditsLocked} onChange={zone => set("timezone", zone)} />
          </Field>
          {planned && <div className="cwl-ui-field is-wide">
            <strong>Planned dates</strong>
            {planned.elements.length + planned.events.length === 0 && <p>No planned dates were found.</p>}
            {planned.elements.map(item => <div className="cwl-c-planned" key={item.id}><span>{item.title} · {item.scheduled_date ?? "Date to follow"}</span>
              {item.scheduled_date && <Button variant="quiet" size="small" disabled={eventEditsLocked} onClick={() => set(wayfinding ? "retreat_start_date" : "start_date", item.scheduled_date!.slice(0, 10))}>
                {wayfinding ? "Use for retreat start" : "Use for workshop date"}
              </Button>}</div>)}
            {planned.events.map(item => <div className="cwl-c-planned" key={item.id}><span>{item.event_name} · {item.start_date_time ? localTime(item.start_date_time, values.timezone).replace("T", " ") : "Time to follow"}</span>
              {item.start_date_time && <Button variant="quiet" size="small" disabled={eventEditsLocked} onClick={() => set(wayfinding ? "pre_call_local" : "start_date", wayfinding ? localTime(item.start_date_time, values.timezone) : localTime(item.start_date_time, values.timezone).slice(0, 10))}>
                {wayfinding ? "Use for pre-call" : "Use for workshop date"}
              </Button>}</div>)}
          </div>}
        </SettingsSection>
        <div id="details-ai">
          <SettingsSection title="AI in the room" description="Switches save as soon as you change them.">
            <div className="cwl-c-switch-row">
              <button type="button" className="cwl-c-switch" role="switch" aria-checked={immediate.ai} aria-labelledby="details-ai-label" aria-describedby="details-ai-help"
                disabled={disabled} onClick={() => updateNow("ai", !immediate.ai)} />
              <AiIcon size={18} />
              <div><strong id="details-ai-label">Use AI in live sessions</strong><p id="details-ai-help">Combine words, group answers, fold questions and write summaries on request.</p></div>
            </div>
          </SettingsSection>
        </div>
        {wayfinding && <div className="cwl-c-section-divider">
          <SettingsSection title="Wayfinding settings">
            {textField("pre_call_local", "datetime-local")}
            {textField("base_year", "number", { help: "Leave blank to use the retreat year." })}
            {textField("retreat_start_date", "date")}
            {textField("retreat_end_date", "date")}
            {textField("governance_body_name")}
            {textField("scripture_translation")}
            {lensFields.map(key => textField(key, "text", { required: true }))}
            {(["mission", "purpose", "values", "strategy", "leadership_rhythms"] as const).map(key =>
              <Field key={key} label={detailsLabels[key]} wide dirty={dirtyFields.includes(key)} help={key === "values" || key === "leadership_rhythms" ? "Use one per line." : undefined}>
                <textarea rows={3} maxLength={10000} value={values[key]} disabled={churchEditsLocked} onChange={event => set(key, event.target.value)} />
              </Field>)}
          </SettingsSection>
        </div>}
      </SettingsCard>
      <DangerZone actions={dangerActions} />
      {notice && <p role="status" className="cwl-c-feedback">{notice}</p>}
      {error && !dialog && <p role="alert" className="cwl-c-feedback is-error">{error}</p>}
      <SaveBar dirtyFields={dirtyFields} labels={detailsLabels} onDiscard={form.discard} onSave={save}
        error={form.error} saving={disabled || uploading} confirmation={form.confirmation} />
    </form>
    <ConfirmDialog open={Boolean(dialog)} title={question} description={<>{consequence}{error && <p role="alert">{error}</p>}</>}
      confirmLabel={actionLabel} cancelLabel={dialog === "end" ? "Keep the workshop going" : "Cancel"} busy={busy}
      onCancel={() => { setDialog(null); setError(""); }} onConfirm={confirm} />
  </>;
}

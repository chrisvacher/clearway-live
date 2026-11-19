"use client";

import { Calendar, EyeOff, Radio, Send, UserRound } from "lucide-react";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@/components/ui/button";
import { StageChip, StatusChip, StepChip } from "@/components/ui/chips";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import { JumpTo } from "@/components/ui/jump-to";
import { Menu } from "@/components/ui/menu";
import { PageHeader } from "@/components/ui/page-header";
import { SaveBar } from "@/components/ui/save-bar";
import { DangerZone, Field, SettingsCard, SettingsSection } from "@/components/ui/settings";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { useDirtyForm } from "@/hooks/use-dirty-form";

function Fixture() {
  const toast = useToast();
  const [tab, setTab] = useState("people");
  const [zone, setZone] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [showClose, setShowClose] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const form = useDirtyForm({ title: "Workshop at Pickering" });
  const next = "/next";

  return <main data-surface="setup" style={{ padding: "var(--space-4)", fontFamily: "var(--cwl-font)" }}>
    <PageHeader kicker="Pickering Church" title="Workshop at Pickering"
      lead="Prepare the room for the workshop."
      stage={<StageChip stage="setup" type="team_workshop" interactive onStageChange={() => setShowClose(true)} />}
      facts={[{ icon: <Calendar aria-hidden="true" />, text: "November 24" }]}
      secondary={<Button>Edit event</Button>}
      more={[{ label: "Print run of show", onSelect: () => toast("Run of show opened") }]}
      primary={<Button variant="primary"><Radio aria-hidden="true" />Open the live room</Button>} />
    <div>
      <Button variant="quiet" iconOnly aria-label="Show person"><UserRound aria-hidden="true" /></Button>
      <Button disabled>Save draft</Button>
      <Button size="small" onClick={() => toast("Response hidden", { icon: <EyeOff aria-hidden="true" />, action: { label: "Show again", onClick: () => toast("Response restored") } })}>Hide response</Button>
      <Button onClick={() => setShowJump(true)}>Jump to</Button>
      <a href={next}>Open another page</a>
    </div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
      {(["setup", "ready", "live", "done", "discover", "pre_call", "retreat", "follow_up", "closed"] as const).map(stage => <StageChip key={stage} stage={stage} />)}
      {(["draft", "ready", "preview", "live", "done"] as const).map(state => <StepChip key={state} state={state} compact />)}
      {(["neutral", "success", "warning", "error", "info"] as const).map(tone => <StatusChip key={tone} tone={tone}>{tone}</StatusChip>)}
    </div>
    <Tabs label="People and access" value={tab} onChange={setTab} items={[{ label: "People", id: "people", count: 1 }, { label: "Access", id: "access" }]} />
    <TabPanel id="people" active={tab === "people"}>People joining the room.</TabPanel>
    <TabPanel id="access" active={tab === "access"}>How people join.</TabPanel>
    <SettingsCard>
      <SettingsSection title="The event" description="Set the event title and time zone.">
        <Field label="Event title" wide dirty={form.dirtyFields.includes("title")}>
          <input value={form.values.title} onChange={event => form.set("title", event.target.value)} />
        </Field>
        <Field label="Time zone" help="Choose the time zone for the room.">
          <Combobox label="Time zone" value={zone} onChange={setZone} options={[
            { value: "America/Toronto", label: "Eastern Time · Toronto", detail: "UTC−5", group: "Common", keywords: "Canada" },
            { value: "America/Phoenix", label: "Mountain Time · Phoenix", detail: "UTC−7", group: "All zones" },
          ]} />
        </Field>
      </SettingsSection>
    </SettingsCard>
    <DataTable label="Attendees" columns={[{ id: "name", label: "Name" }, { id: "now", label: "Now" }, { id: "actions", label: "Actions" }]}
      rows={[{ id: "ruth", cells: { name: "Ruth", now: <StatusChip tone="success">In the room</StatusChip>, actions: <Menu label="More for Ruth" items={[{ label: "Edit Ruth", onSelect: () => toast("Opened Ruth") }]} /> } }]}
      selected={selected} onSelectionChange={setSelected} bulkActions={<Button size="small">Send invites</Button>} />
    <DangerZone actions={[{ title: "Close this engagement", description: "Ends every device sign-in.", action: <Button size="small" variant="danger" onClick={() => setShowClose(true)}>Close engagement</Button> }]} />
    <div data-surface="control"><button type="button" className="ctl-take is-golive"><Send aria-hidden="true" />Go live <kbd className="ctl-kbd">Enter</kbd></button></div>
    <SaveBar dirtyFields={form.dirtyFields} labels={{ title: "Event title" }} onDiscard={form.discard}
      saving={form.saving} error={form.error} confirmation={form.confirmation}
      onSave={() => form.save(async values => { if (values.title === "Unavailable title") throw new Error("That title is unavailable."); })} />
    <ConfirmDialog open={showClose} title="Close this engagement?" description="Ends every device sign-in." confirmLabel="Close engagement"
      onCancel={() => setShowClose(false)} onConfirm={() => { setShowClose(false); toast("Engagement closed"); }} />
    <JumpTo open={showJump} onOpen={() => setShowJump(true)} onClose={() => setShowJump(false)} items={[
      { id: "live", label: "Live room · Pickering workshop", detail: "Pickering Church", group: "Pages", icon: <Radio aria-hidden="true" />, keywords: "Pickering", onSelect: () => toast("Picked the live room") },
      { id: "new", label: "New engagement", group: "Actions", onSelect: () => toast("New engagement") },
    ]} />
  </main>;
}

createRoot(document.getElementById("root")!).render(<ToastProvider><Fixture /></ToastProvider>);

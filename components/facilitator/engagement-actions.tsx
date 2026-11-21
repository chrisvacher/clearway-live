"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { MenuItem } from "@/components/ui/menu";
import { DuplicateRunOfShow } from "./duplicate-run-of-show";

export async function engagementRequest(body: Record<string, unknown>, signal?: AbortSignal) {
  const response = await fetch("/api/setup/engagement", {
    method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify(body), signal,
  });
  const result = await response.json() as { ok: boolean; message?: string; status?: string; id?: string };
  if (!response.ok || !result.ok) throw new Error(result.message || "We couldn't finish that. Please try again.");
  return result;
}

export function CopyRoomLink({ href, label }: { href: string; label: string }) {
  const toast = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      toast(`Link copied: ${label}`);
    } catch {
      toast("Copying isn't available. Select the room link and copy it.");
    }
  }
  return <Button variant="quiet" size="small" iconOnly aria-label="Copy link" onClick={() => void copy()}>
    <Copy aria-hidden="true" />
  </Button>;
}

type EventSummary = { id: string; title: string; type?: string; stepCount?: number };

export function useEventMenu(canDuplicate: boolean) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<EventSummary | null>(null);
  const [copying, setCopying] = useState<EventSummary | null>(null);
  const [duplicating, setDuplicating] = useState(false);

  function duplicate(event: EventSummary) {
    if (duplicating) return;
    setDuplicating(true);
    void engagementRequest({ action: "duplicate", id: event.id })
      .then(result => {
        if (!result.id) throw new Error("We couldn't duplicate this event.");
        toast("New engagement created");
        router.push(`/admin/${result.id}`);
        router.refresh();
      })
      .catch((error: unknown) => toast(error instanceof Error ? error.message : "We couldn't duplicate this event."))
      .finally(() => setDuplicating(false));
  }

  function actions(event: EventSummary, overview = false): MenuItem[] {
    const duplicateAllowed = canDuplicate && event.type !== "practice";
    const canCopy = (event.stepCount ?? 0) > 0;
    return [
      ...(duplicateAllowed ? [{ label: overview ? "Duplicate" : "Duplicate as a new event", disabled: duplicating, onSelect: () => duplicate(event), dividerBefore: !overview }] : []),
      ...(canCopy ? [{ label: "Duplicate run of show", onSelect: () => setCopying(event), dividerBefore: !overview && !duplicateAllowed }] : []),
      { label: "Save run of show as template", onSelect: () => setEditing(event), dividerBefore: !overview && !duplicateAllowed && !canCopy },
      ...(overview ? [{ label: "Print run of show", href: `/admin/${event.id}/run-of-show/print` }] : []),
    ];
  }

  const templateDialog = editing && <SaveRunTemplate event={editing} onClose={() => setEditing(null)} />;
  const copyDialog = copying && <DuplicateRunOfShow source={copying.id} onClose={() => setCopying(null)} />;
  return { actions, templateDialog, copyDialog };
}

function SaveRunTemplate({ event, onClose }: { event: EventSummary; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(event.title.slice(0, 120));
  const [shared, setShared] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(form: FormEvent<HTMLFormElement>) {
    form.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", input: { engagement: event.id, name, shared } }) });
      const result = await response.json() as { status: string; message?: string };
      if (!response.ok || result.status !== "ok") throw new Error(result.message || "We couldn't save the template.");
      toast(`Saved template: ${name.trim()}`);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't save the template.");
    } finally {
      setBusy(false);
    }
  }

  return <Dialog open label="Save run of show as template" className="eng-template-dialog" onClose={() => { if (!busy) onClose(); }}>
    <h2>Save run of show as template</h2>
    <form className="form-stack" onSubmit={save}>
      <label>Name<input value={name} required maxLength={120} data-initial-focus onChange={e => setName(e.target.value)} /></label>
      <p>Copies the run of show, including prompts, settings and presenter notes.</p>
      <label className="show-check"><input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} />Share with the Clearway team</label>
      {error && <p role="alert">{error}</p>}
      <div className="admin-actions"><Button disabled={busy} onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" disabled={busy || !name.trim()}>Save template</Button></div>
    </form>
  </Dialog>;
}

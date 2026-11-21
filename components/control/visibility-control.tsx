"use client";
import { useState } from "react";
import { Eye, Lock } from "lucide-react";
import { alwaysPrivate, canBePrivate, visibilityOf, type Visibility } from "@/lib/interactions/visibility";
import type { InteractionKind } from "@/lib/interactions/kinds";
import { useToast } from "@/components/ui/toast";
import type { Room } from "./live-controls";

type Step = { id: string; title: string; interaction: InteractionKind; options?: Record<string, unknown> };
export function VisibilityControl({ room, step }: { room: Room; step: Step | null | undefined }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  if (!step || !canBePrivate(step.interaction) || alwaysPrivate(step.interaction)) return null;
  const current = visibilityOf(step);
  async function change(next: Visibility, undo = false) {
    if (!step || (!undo && next === current)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/run-of-show/${room.show.context.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "visibility", input: { session: step.id, visibility: next } }) });
      const result = await response.json();
      if (!response.ok || result.status !== "ok") throw new Error(result.status === "private_source" ? "This step reads private answers. Keep it private." : "Couldn't change who sees answers. Try again.");
      room.refresh();
      if (!undo) toast(next === "private" ? `Answers on ${step.title} are now private. The TV and phones show the count only.` : `Answers on ${step.title} now show on the TV and phones.`, { duration: 8000, action: { label: "Undo", onClick: () => change(current, true) } });
    } catch (error) { room.setMessage(error instanceof Error ? error.message : "Try again."); if (undo) throw error; }
    finally { setBusy(false); }
  }
  return <div className="ctl-visibility"><span className="ctl-label">Who sees answers</span><div className="ctl-seg" role="group" aria-label="Who sees answers">
    {(["public", "private"] as const).map(value => { const Icon = value === "public" ? Eye : Lock; return <button key={value} type="button" disabled={busy} aria-pressed={current === value} onClick={() => void change(value)}><Icon size={16} aria-hidden="true" />{value === "public" ? "Everyone" : "Facilitators only"}</button>; })}
  </div><p className="show-help">You can change this while the step is live. Answers already sent follow the new choice.</p></div>;
}

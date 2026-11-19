"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Clock, MapPin, Radio, Users } from "lucide-react";
import { StageChip, StatusChip } from "@/components/ui/chips";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import type { Stage, StageChoice } from "@/lib/setup/stage";
import { engagementRequest, useEventMenu } from "./engagement-actions";
import { setupRequest } from "./setup-editor";

export function OverviewHeader({ id, title, church, type, stage, when, place, lead, countdown, canDuplicate }: {
  id: string; title: string; church: string; type: string; stage: Stage; when: string | null; place: string | null;
  lead?: string; countdown: string | null; canDuplicate: boolean;
}) {
  const router = useRouter(), toast = useToast();
  const eventMenu = useEventMenu(canDuplicate);
  const [confirm, setConfirm] = useState<StageChoice | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const workshop = type === "team_workshop";

  async function change(choice: StageChoice) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (workshop) await setupRequest({ id, action: choice.stage === "done" ? "end_workshop" : "reopen_workshop" });
      else await engagementRequest({ id, action: "stage", status: choice.status });
      setConfirm(null);
      toast(workshop ? choice.stage === "done" ? "Workshop ended" : "Workshop reopened" : "Stage changed");
      router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "We couldn't change the stage.";
      setError(message);
      if (!confirm) toast(message);
    } finally {
      setBusy(false);
    }
  }

  const facts = [
    { icon: <Calendar aria-hidden="true" />, text: when ?? "No date yet" },
    ...(place ? [{ icon: <MapPin aria-hidden="true" />, text: place }] : []),
    ...(lead ? [{ icon: <Users aria-hidden="true" />, text: lead }] : []),
    ...(countdown ? [{ icon: null, text: <StatusChip tone="info" icon={<Clock aria-hidden="true" />}>{countdown}</StatusChip> }] : []),
  ];
  return <>
    <PageHeader kicker={church} title={title}
      stage={<StageChip stage={stage} type={type} interactive onStageChange={choice => {
        if (choice.status === "closed") { setConfirm(choice); setError(""); }
        else void change(choice);
      }} />}
      facts={facts} more={eventMenu.actions({ id, title }, true)}
      primary={<Button variant="primary" href={`/control/${id}`}><Radio aria-hidden="true" />Open the live room</Button>} />
    {confirm && <ConfirmDialog open title={workshop ? "End the workshop?" : "Close this engagement?"}
      description={<>
        <p>{workshop
          ? "Phones are signed out and answers close. Results stay here to read and download. Reopen the workshop to let people sign in and answer again."
          : "This ends every device sign-in. Results stay here. Reopening asks people to sign in again."}</p>
        {error && <p role="alert">{error}</p>}
      </>}
      confirmLabel={workshop ? "End the workshop" : "Close engagement"}
      cancelLabel={workshop ? "Keep going" : "Cancel"}
      onCancel={() => setConfirm(null)} onConfirm={() => void change(confirm)} busy={busy} />}
    {eventMenu.templateDialog}
  </>;
}

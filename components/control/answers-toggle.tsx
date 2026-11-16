"use client";
import { CircleStop, Inbox } from "lucide-react";
import { kindOf } from "@/lib/interactions/kinds";
import type { useControlRoom } from "./use-control-room";

type Room = ReturnType<typeof useControlRoom>;

// One toggle for the live step's answers (November 16): Stop answers, then Take answers. Nothing else closes a step but
// Close part and End workshop, so a stopped step stays stopped when it comes back to the TV until Take answers.
export function AnswersToggle({ room, className = "show-button" }: { room: Room; className?: string }) {
  const session = room.frame?.session, busy = Boolean(room.pending) || !room.frame || room.show.context.closed;
  if (!session || !kindOf(session)?.input) return null;
  return session.state === "closed"
    ? <button className={`${className} is-primary`} disabled={busy} onClick={() => void room.press("take_answers")} data-testid="take-answers"><Inbox size={18} aria-hidden="true" />Take answers</button>
    : <button className={className} disabled={busy} onClick={() => void room.press("stop_answers")} data-testid="stop-answers"><CircleStop size={18} aria-hidden="true" />Stop answers</button>;
}

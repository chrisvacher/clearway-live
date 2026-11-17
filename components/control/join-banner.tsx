"use client";
import { useState } from "react";
import { Megaphone } from "lucide-react";
import type { Room } from "./live-controls";

// The join banner (November 17): the room link and QR code along the bottom of the TV for late arrivals, over whatever is
// live. One toggle on the live room's transport bar (key L) and on the remote. The database decides; the TV shows it
// once the room broadcasts, like every other press.
export async function setJoinBanner(engagement: string, on: boolean): Promise<string> {
  try {
    const response = await fetch(`/api/control/${engagement}/banner`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on }) });
    const data = await response.json().catch(() => ({ status: "unavailable" })) as { status?: string };
    return data.status ?? "unavailable";
  } catch { return "unavailable"; }
}
export const bannerMessage = (status: string) => ["ok", "unchanged"].includes(status) ? ""
  : status === "closed" ? "This engagement has closed." : status === "denied" ? "Only the facilitators can change the join banner." : "The join banner didn’t change. Please try again.";

export function JoinBannerButton({ room, className, keyHint }: { room: Room; className: string; keyHint?: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const on = Boolean(room.frame?.state.join_banner), engagement = room.show.context.id;
  const closed = room.show.context.closed;
  return <button type="button" className={`${className}${on ? " is-on" : ""}`} aria-pressed={on} disabled={busy || !room.frame || closed} aria-keyshortcuts={keyHint ? "L" : undefined}
    title={on ? "Take the join banner off the TV" : "Show the room link and QR code along the bottom of the TV, over what is live"}
    onClick={async () => { setBusy(true); room.setMessage(bannerMessage(await setJoinBanner(engagement, !on))); setBusy(false); }}>
    <Megaphone size={16} aria-hidden="true" />{on ? "Banner on" : "Join banner"}{keyHint}</button>;
}

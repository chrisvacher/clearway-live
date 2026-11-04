"use client";
import { useState } from "react";
import { Hand } from "lucide-react";
import type { LiveSnapshot } from "@/lib/live/types";
import { TeamRemote, type TeamRoom } from "./team-remote";
import { post, useIntent } from "./use-intent";

// On the phone of the person who was handed the remote: a switch between the remote and the
// ordinary participant view. Everyone else sees nothing here. The block and the controls come
// from the server for that one person; the rest of the room never receives them.
export function PhoneTeamRemote({ engagement, frame }: { engagement: string; frame: LiveSnapshot | null }) {
  // Nothing is read until a block is handed over.
  return frame?.state.team_led_block_id ? <Held engagement={engagement} frame={frame} /> : null;
}
function Held({ engagement, frame }: { engagement: string; frame: LiveSnapshot }) {
  const base = `/api/live/${engagement}/intent`;
  const { view, remote } = useIntent(base, frame?.version, 4000);
  const [on, setOn] = useState(true);
  if (!remote?.active || !remote.i_am_designee) return null;
  const room: TeamRoom = { live_session_id: frame?.state.live_session_id ?? null, phones_down: frame?.state.phones_down, spotlight_key: frame?.state.spotlight_key ?? null, results: frame?.state.results };
  const pairs = (view?.cards ?? []).map(c => ({ card: c.id, people: c.pair.map(p => p.first) }));
  return <section className="hi-phone-remote" aria-label="You have the remote">
    <button type="button" className="show-button is-small" aria-pressed={on} onClick={() => setOn(v => !v)}><Hand size={16} aria-hidden="true" />{on ? "Show my phone view" : "Show the remote"}</button>
    {on && <TeamRemote block={remote.block ?? []} room={room} holds={remote.i_hold === true} ends={remote.ends_at}
      pairs={pairs} send={(action, p) => post(base, { kind: "press", id: crypto.randomUUID(), action, p })} />}
  </section>;
}

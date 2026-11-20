"use client";

import Link from "next/link";
import { Eye, MonitorSmartphone, PowerOff, RefreshCw, X } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { TvSizeControl } from "@/components/facilitator/tv-size-control";
import type { RoomSize } from "@/lib/control/types";
import { HandoverPanel } from "@/components/interactions/intent/handover";
import { QaAnyTime } from "@/components/interactions/qa/qa-panel";
import { ScribeFeed } from "@/components/scribe/scribe-feed";
import { OvernightCard } from "@/components/overnight/overnight-card";
import { AfterLink } from "@/components/report/after-link";
import { actionNames } from "@/lib/control/policy";
import { aiPressNames } from "@/lib/interactions/ai";
import { practiceId } from "@/lib/room/practice";
import { ItemList, useSecondTap, type Room } from "./live-controls";
import { RehearsalPanel, StartFresh } from "./rehearsal";
import { TimerCard } from "./timer-panel";
import { SecondComputer } from "./second-computer";
import { EventLink } from "./event-link";

export type AdminTab = "room" | "questions" | "responses" | "tools";
export type DrawerPhase = "closed" | "opening" | "open" | "closing";

function Section({ id, title, children }: { id?: string; title: ReactNode; children: ReactNode }) {
  return <section id={id} className="ctl-admin-section"><h3>{title}</h3>{children}</section>;
}

export function RoomAdmin({ room, phase, tab, onTab, onClose, door, workshop, handover, onEnd, closeRef }: {
  room: Room;
  phase: DrawerPhase;
  tab: AdminTab;
  onTab: (tab: AdminTab) => void;
  onClose: () => void;
  door: ReactNode;
  workshop: boolean;
  handover: boolean;
  onEnd: () => void;
  closeRef: Ref<HTMLButtonElement>;
}) {
  const { frame, status, pending, show } = room;
  const { id, closed } = show.context;
  const counts = status?.counts;
  const busy = Boolean(pending) || !frame || closed;
  const tvOnPhones = Boolean(frame?.state.show_tv_on_phones);
  const waiting = frame?.qa?.pool?.waiting ?? 0;
  const confirm = useSecondTap();
  const visible = phase !== "closed";
  const toast = useToast();
  const tvSize = frame?.display?.room_size ?? "very_small";
  async function setTvSize(size: RoomSize) {
    const prior = tvSize;
    const changed = await room.press("room_size", { size });
    if (changed.status === "ok") toast("TV type size changed", {
      action: { label: "Undo", onClick: async () => {
        const result = await room.press("room_size", { size: prior });
        if (result.status !== "ok") throw new Error("The room moved on.");
      } },
    });
  }

  return <aside id="ctl-side" className="ctl-col ctl-side" aria-label="Room admin" aria-describedby="ctl-privacy"
    hidden={!visible} inert={phase === "closing" || undefined}>
    <div className="ctl-side-top">
      <div className="ctl-row is-between ctl-side-title"><h2>Room admin</h2>
        <Button ref={closeRef} iconOnly variant="quiet" aria-label="Close Room admin" onClick={onClose}><X size={16} aria-hidden="true" /></Button>
      </div>
      <Tabs label="Room admin tabs" value={tab} onChange={value => onTab(value as AdminTab)} items={[
        { id: "room", label: "Room" }, { id: "questions", label: "Questions", count: waiting || undefined },
        { id: "responses", label: "Responses" }, { id: "tools", label: "Tools" },
      ]} />
    </div>
    <TabPanel id="room" active={tab === "room"}>
      <div className="ctl-stats">
        <div><b>{counts?.signed_in ?? 0}</b><span>Signed in</span></div>
        <div><b>{counts?.answered ?? 0}</b><span>Answered this step</span></div>
      </div>
      <Section id="ctl-door" title="At the door"><div className="ctl-door">{door}</div></Section>
      <Section title="Timer"><TimerCard room={room} engagement={id} /></Section>
      <Section title="TV size">
        <TvSizeControl value={tvSize} disabled={busy} onChange={size => void setTvSize(size)} />
        <Link href={`/control/${id}/latency`} className="text-link">See the phone to TV report</Link>
      </Section>
      {!workshop && <Section title="Scribe"><ScribeFeed engagement={id} tick={room.scribeTick} live={frame?.state.live_session_id ?? null} promoted={frame?.promoted_quote?.text ?? null} /></Section>}
      {!workshop && <Section title="Overnight review"><OvernightCard engagement={id} tick={room.overnightTick} link /></Section>}
    </TabPanel>
    <TabPanel id="questions" active={tab === "questions"}>
      {frame?.session?.interaction === "qa" ? <p className="show-help">The live step’s questions are in the live step card.</p>
        : frame?.qa?.pool || frame?.qa?.spotlight ? <QaAnyTime room={room} /> : <p className="show-help">No questions are waiting.</p>}
    </TabPanel>
    <TabPanel id="responses" active={tab === "responses"}>
      {tab === "responses" && visible && frame?.session && frame.session.interaction !== "content"
        ? <ItemList room={room} />
        : <p className="show-help">No responses to show.</p>}
    </TabPanel>
    <TabPanel id="tools" active={tab === "tools"}>
      <Section title="TV and phones">
        <div className="ctl-row">
          <Button size="small" disabled={busy} aria-pressed={tvOnPhones} onClick={() => void room.press("tv_on_phones", { on: !tvOnPhones })}>
            {tvOnPhones ? <Eye size={16} aria-hidden="true" /> : <MonitorSmartphone size={16} aria-hidden="true" />}
            {tvOnPhones ? "Stop the TV view on phones" : "TV view on phones"}
          </Button>
          <Button size="small" disabled={busy} onClick={() => confirm.tap("refresh", () => void room.press("refresh_phones"))}>
            <RefreshCw size={16} aria-hidden="true" />{confirm.armed === "refresh" ? "Tap again to refresh phones" : "Refresh phones"}
          </Button>
        </div>
        <SecondComputer engagement={id} closed={closed} />
      </Section>
      <EventLink engagement={id} compact wrap={body => <div className="ctl-admin-section">{body}</div>} />
      {handover && <Section title="The remote"><HandoverPanel room={room} /></Section>}
      {!workshop && <>
        <div className="ctl-row"><Link className="show-button is-small" href={`/control/${id}/map`}>Draft Clearway Map</Link><AfterLink engagement={id} /></div>
      </>}
      <Section title="Rehearsal"><RehearsalPanel room={room} /></Section>
      <Section title="Recent presses">
        {status?.controls.length ? <ul className="ctl-log">{status.controls.slice(0, 5).map(item => <li key={item.id}><span>{item.by || "The room"}</span> {(aiPressNames[item.action] ?? actionNames[item.action] ?? item.action.replaceAll("_", " ")).toLowerCase()}</li>)}</ul> : <p className="show-help">No recent presses.</p>}
      </Section>
      {(id !== practiceId || (workshop && !closed)) && <div className="ctl-admin-danger">
        <Section title="Danger zone">
          {id !== practiceId && <StartFresh room={room} />}
          {workshop && !closed && <div className="ctl-danger-action">
            <div><strong>End the workshop</strong><p className="show-help">Phones sign out and answers close.</p></div>
            <Button variant="danger" size="small" onClick={onEnd} data-testid="end-workshop-tools"><PowerOff size={16} aria-hidden="true" />End the workshop</Button>
          </div>}
        </Section>
      </div>}
    </TabPanel>
  </aside>;
}

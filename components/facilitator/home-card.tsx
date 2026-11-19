"use client";
import { useState } from "react";
import Link from "next/link";
import { chooseHome, readHome, type HomeList } from "@/lib/images/home";
import { imageUrl } from "@/lib/images/shared";
import { loopTransitionLabels, type LoopTransition } from "@/lib/images/loop";
import { Select } from "@/components/ui/select";
import "./home-card.css";

// The Screens page's Home card (LP-1): what the Home control under the Live screen puts on the TV. The usual holding
// screen, or one of the engagement's image loops. The loop is for the TV only: phones show the waiting message without it.
export function HomeCard({ id, initial, closed }: { id: string; initial: HomeList; closed: boolean }) {
  const [data, setData] = useState(initial), [busy, setBusy] = useState(false), [note, setNote] = useState(""), [failed, setFailed] = useState(false);
  const [pick, setPick] = useState(initial.home ?? initial.loops[0]?.id ?? "");
  const loop = data.loops.find(l => l.id === (data.home ?? pick));
  async function choose(session: string | null) {
    setBusy(true); setNote(""); setFailed(false);
    const result = await chooseHome(id, session);
    if (result.ok) { setData(await readHome(id) ?? { ...data, home: session }); setNote(session ? "Home is now the image loop." : "Home is the holding screen."); }
    else { setFailed(true); setNote(result.message); }
    setBusy(false);
  }
  const words = (l: HomeList["loops"][number]) => `${l.title} · ${l.images.length} ${l.images.length === 1 ? "image" : "images"} · ${l.seconds} seconds`;
  return <section className="admin-panel tv-screens-form home-card" data-home-card>
    <h2>Home screen</h2>
    <p>What the Home control under the Live screen puts on the TV. Phones show the waiting message, never the loop.</p>
    <div className="home-card-options" role="radiogroup" aria-label="Home screen">
      <label className="show-check" htmlFor="home-holding"><input id="home-holding" type="radio" name="home" checked={!data.home} disabled={busy || closed} onChange={() => void choose(null)} />The holding screen<span className="tv-screens-help">the church’s name and welcome</span></label>
      <label className="show-check" htmlFor="home-loop"><input id="home-loop" type="radio" name="home" checked={Boolean(data.home)} disabled={busy || closed || !data.loops.length} onChange={() => { if (pick) void choose(pick); }} />An image loop</label>
      {data.loops.length ? <div className="home-card-loop">
        <Select aria-label="Which image loop" value={data.home ?? pick} disabled={busy || closed} onChange={e => { setPick(e.target.value); if (data.home) void choose(e.target.value); }}>
          {data.loops.map(l => <option key={l.id} value={l.id}>{words(l)}</option>)}</Select>
        {loop && <div className="home-card-preview">
          <figure className="step-image-thumb">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {loop.images[0] ? <img src={imageUrl(id, loop.images[0], "control")} alt="The loop’s first image" /> : null}</figure>
          <div className="tv-screens-help">{loopTransitionLabels[loop.transition as LoopTransition] ?? "Cross-fade"}<br />Phones show only the room’s waiting message.<br /><Link href={`/setup/${id}/run-of-show`}>Edit the loop in the run of show</Link></div>
        </div>}
      </div> : <p className="tv-screens-help">Add an Image loop step in the run of show to use it as Home.</p>}
    </div>
    {note && <p className={`admin-saved${failed ? " is-error" : ""}`} role={failed ? "alert" : "status"}>{note}</p>}
  </section>;
}

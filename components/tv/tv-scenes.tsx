"use client";
import { Check } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { roomQr } from "@/lib/tv/qr";
import { shortRoomLink } from "@/lib/tv/policy";
import type { LiveSnapshot } from "@/lib/live/types";
import type { TvStatus } from "@/lib/tv/types";
import type { TvFlow } from "@/lib/tv/flow";
import { tokenMs } from "@/lib/tv/board";
import { Spotlight, Tally } from "./live-board";
import { ContentScreen, ScreenCheck } from "./content-screen";
import { ChurchLockup, LiveMark, type MarkState } from "./live-mark";
import { tvViews } from "@/components/interactions/tv-views";
import { contentOf, kindOf } from "@/lib/interactions/kinds";
import { QaWaiting } from "@/components/interactions/qa/qa-tv";
import { QaSpotlight } from "@/components/interactions/qa/qa-spotlight";
import { AiFoot } from "@/components/interactions/ai/ai-foot";

function Qr({ code }: { code: string }) {
  const qr = useMemo(() => roomQr(code), [code]);
  return <svg className="tv-qr" viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label="Scan to open your room" shapeRendering="crispEdges"><rect width={qr.size} height={qr.size} className="tv-qr-ground" /><path d={qr.path} className="tv-qr-ink" /></svg>;
}
// The countdown comes from the TV's pairing connection, measured against the
// server's clock, and reaches 0:00 as the code leaves the screen.
function CodeExpiry({ seconds }: { seconds: number }) {
  return <span className="tv-upclose">Code changes in {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>;
}
// Session change: the next session is prepared behind the current one and
// cross-fades in; the old layer keeps its last picture while it fades out, so
// the TV never blanks.
type Layer = { id: string; frame: LiveSnapshot; leaving: boolean; entering: boolean };
function SessionLayers({ frame, flow }: { frame: LiveSnapshot | null; flow?: TvFlow | null }) {
  const id = frame?.state.tv_content === "session" ? frame.session?.id ?? null : null;
  const [layers, setLayers] = useState<Layer[]>(() => frame && id ? [{ id, frame, leaving: false, entering: false }] : []);
  const box = useRef<HTMLDivElement>(null), last = useRef<LiveSnapshot | null>(frame);
  // The new layer joins in the same render as the frame that brought it, so the
  // TV's fit step measures the session that is actually on screen.
  if (frame && id && !layers.some(layer => layer.id === id && !layer.leaving)) {
    setLayers([...layers.filter(layer => layer.id !== id).map(layer => ({ ...layer, leaving: true, frame: !layer.leaving && last.current?.session?.id === layer.id ? last.current : layer.frame })),
      { id, frame, leaving: false, entering: layers.length > 0 }]);
  }
  useEffect(() => { if (frame && id) last.current = frame; }, [frame, id]);
  useEffect(() => {
    if (!layers.some(layer => layer.leaving || layer.entering)) return;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setLayers(current => current.map(layer => layer.entering ? { ...layer, entering: false } : layer))));
    const wait = box.current ? tokenMs(box.current, "cwl-dur-make-room") + 50 : 750;
    const timer = setTimeout(() => setLayers(current => current.filter(layer => !layer.leaving)), wait);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [layers]);
  return <div ref={box} className="tv-layers">{layers.map(layer => {
    const shown = !layer.leaving && frame && frame.session?.id === layer.id ? frame : layer.frame, session = shown.session!;
    const kind = kindOf(session), input = Boolean(kind?.input), View = tvViews[session.interaction];
    return <div key={layer.id} className={`tv-layer${layer.leaving ? " is-leaving" : ""}${layer.entering ? " is-entering" : ""}${input ? " is-input" : " is-content"}`} data-kind={session.interaction} aria-hidden={layer.leaving}>
      {input ? <>
        <p className="tv-eyebrow">{session.title}</p>
        <h1 className="tv-headline">{session.prompt}</h1>
        {View && <View session={session.id} frame={shown} flow={flow} />}
        {!kind?.structured && <p className="tv-note tv-muted">Waiting for answers</p>}
        {session.settings?.join_strip && shown.display && <div className="tv-join-strip"><span className="tv-upclose">live.clearway.co/{shown.display.room_code}</span><Qr code={shown.display.room_code} /></div>}
      </> : <ContentScreen frame={shown} />}
    </div>;
  })}</div>;
}

export function TvScenes({ status, pair, frame, reconnecting, nameLimit, flow }: { status: TvStatus; pair?: { code: string | null; seconds: number }; frame: LiveSnapshot | null; reconnecting: boolean; nameLimit: number; flow?: TvFlow | null }) {
  // Only a code the server will still accept is shown. Between one code ending
  // and its replacement arriving, the cards stay in place, empty.
  const code = status.status === "pair" ? pair?.code ?? null : null;
  const display = frame?.display, presence = frame?.presence;
  const paired = status.status === "paired" && Boolean(display);
  const mode = paired ? frame!.state.tv_content : status.status === "pair" ? "pair" : "opening";
  const link = display ? shortRoomLink(display.room_code) : "";
  const session = frame?.session ?? null, kind = kindOf(session);
  const inputOn = mode === "session" && Boolean(kind?.input);
  // A screen check in the run of show uses the full-bleed check, like the room's own.
  const checkOn = mode === "screen_check" || (mode === "session" && session?.interaction === "content" && contentOf(session.options).screen === "screen_check");
  const mark: MarkState = !inputOn || !session ? null : session.state === "closed" ? "closed"
    : ["live", "phones_down"].includes(session.state) ? (frame!.state.phones_down || session.state === "phones_down" ? "down" : "live") : null;
  return <>
    <div className="tv-texture" aria-hidden="true"><span /></div>
    <header className="tv-top"><div className="tv-brand-row">{paired && display && <ChurchLockup display={display} />}</div>
      <div className="tv-top-status"><LiveMark state={mark} reconnecting={reconnecting} /></div>
    </header>
    <div className="tv-scenes">
      <section className={`tv-scene tv-pair${mode === "pair" ? " is-active" : ""}`} aria-hidden={mode !== "pair"}>
        <h1 className="tv-eyebrow">Pair this screen</h1><div className="tv-code" aria-label={code ? `Pairing code ${code.split("").join(" ")}` : "Pairing code"}>{(code ?? "      ").split("").map((digit, i) => <span key={i} className={i === 3 ? "has-gap" : ""}>{digit}</span>)}</div>
        <p className="tv-body">On your laptop, open your engagement and choose <strong>Pair a TV</strong>. Enter this code.</p>
      </section>
      <section className={`tv-scene tv-holding${mode === "holding" ? " is-active" : ""}`} aria-hidden={mode !== "holding"}>
        <p className="tv-eyebrow">{display?.title}</p><h1 className="tv-headline-xl"><strong>{display?.church}</strong></h1><p className="tv-body tv-muted"><Check aria-hidden="true" /> This screen is paired</p>
      </section>
      <section className={`tv-scene tv-join${mode === "join" ? " is-active" : ""}`} aria-hidden={mode !== "join"}>
        {display && <><Qr code={display.room_code} /><div><p className="tv-eyebrow">{display.church}</p><h1 className="tv-join-link" aria-label={link.replace("https://", "")}><span>live.clearway.co</span><span>/{display.room_code}</span></h1><p className="tv-body tv-muted">Scan the code or type the link. No app needed.</p><div className="tv-names" aria-live="polite">{presence?.names.length ? presence.names.slice(0, nameLimit).map(person => <span key={person.key} data-name-key={person.key}>{person.name}</span>) : <span>Waiting for the first phone</span>}{(presence?.count || 0) > nameLimit && <span>+ {(presence?.count || 0) - nameLimit} more</span>}</div></div></>}
      </section>
      <section className={`tv-scene tv-session${mode === "session" ? " is-active" : ""}`} aria-hidden={mode !== "session"}>
        <SessionLayers frame={paired ? frame : null} flow={flow} />
      </section>
      <section className={`tv-scene tv-opening${mode === "opening" ? " is-active" : ""}`} aria-hidden={mode !== "opening"}><h1 className="tv-headline">{status.status === "closed" ? "This engagement has closed" : "Opening this screen"}</h1></section>
    </div>
    <section className={`tv-check${checkOn ? " is-active" : ""}`} aria-hidden={!checkOn}><ScreenCheck /></section>
    {paired && <Spotlight frame={frame} />}
    {paired && <QaSpotlight frame={frame} />}
    <footer className="tv-foot"><span className="tv-foot-left">{mode === "pair" && <span className="tv-upclose">live.clearway.co/tv</span>}{code && pair && <CodeExpiry seconds={pair.seconds} />}{paired && <QaWaiting frame={frame} />}{paired && <AiFoot frame={frame} />}</span>
      <span className="tv-foot-right">{mode === "join" && <span className="tv-tally"><b>{presence?.count || 0}</b> here</span>}
        {inputOn && frame && <Tally flow={flow} results={frame.state.results} counts={kind?.counts} kind={session?.interaction} />}</span></footer>
  </>;
}

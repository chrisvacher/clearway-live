"use client";
import Image from "next/image";
import { Check, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { roomQr } from "@/lib/tv/qr";
import { shortRoomLink } from "@/lib/tv/policy";
import type { LiveSnapshot } from "@/lib/live/types";
import type { TvStatus } from "@/lib/tv/types";
import type { TvFlow } from "@/lib/tv/flow";
import { tokenMs } from "@/lib/tv/board";
import { LiveBoard, Spotlight, Tally } from "./live-board";

function Qr({ code }: { code: string }) {
  const qr = useMemo(() => roomQr(code), [code]);
  return <svg className="tv-qr" viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label="Scan to open your room" shapeRendering="crispEdges"><rect width={qr.size} height={qr.size} className="tv-qr-ground" /><path d={qr.path} className="tv-qr-ink" /></svg>;
}
function CodeExpiry({ expires }: { expires: string }) {
  const [seconds, setSeconds] = useState(300);
  useEffect(() => { const tick = () => setSeconds(Math.max(0, Math.ceil((Date.parse(expires) - Date.now()) / 1000))); tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer); }, [expires]);
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
    const input = session.interaction !== "content";
    return <div key={layer.id} className={`tv-layer${layer.leaving ? " is-leaving" : ""}${layer.entering ? " is-entering" : ""}${input ? " is-input" : " is-content"}`} aria-hidden={layer.leaving}>
      <p className="tv-eyebrow">{session.title}</p>
      {input ? <>
        <h1 className="tv-headline">{session.prompt}</h1>
        <LiveBoard kind={session.interaction as "word_cloud" | "wall"} session={session.id} frame={shown} flow={flow} />
        <p className="tv-note tv-muted">Waiting for answers</p>
        {session.settings?.join_strip && shown.display && <div className="tv-join-strip"><span className="tv-upclose">live.clearway.co/r/{shown.display.room_code}</span><Qr code={shown.display.room_code} /></div>}
      </> : <h1 className="tv-headline-xl tv-content-text">{session.prompt}</h1>}
    </div>;
  })}</div>;
}

export function TvScenes({ status, frame, reconnecting, nameLimit, flow }: { status: TvStatus; frame: LiveSnapshot | null; reconnecting: boolean; nameLimit: number; flow?: TvFlow | null }) {
  const display = frame?.display, presence = frame?.presence;
  const paired = status.status === "paired" && Boolean(display);
  const mode = paired ? frame!.state.tv_content : status.status === "pair" ? "pair" : "opening";
  const link = display ? shortRoomLink(display.room_code) : "";
  return <>
    <div className="tv-texture" aria-hidden="true"><span /></div>
    <header className="tv-top"><div className="tv-brand-row"><span className="tv-mark" role="img" aria-label="Clearway" />{paired && <span className="tv-church-logo">{display?.logo_url ? <Image unoptimized src={display.logo_url} alt={display.church} width={180} height={56} /> : <span>{display?.church}</span>}</span>}</div>
      <div className="tv-top-status">{mode === "join" && <span className="tv-tally">{presence?.count || 0} here</span>}{mode === "session" && frame?.session && frame.session.interaction !== "content" && <><Tally flow={flow} total={frame.state.results.total} />{["live", "phones_down"].includes(frame.session.state) && <span className={`tv-live${frame.state.phones_down ? " is-down" : ""}`}>{frame.state.phones_down ? "Phones down" : "Live"}</span>}</>}</div>
    </header>
    <div className="tv-scenes">
      <section className={`tv-scene tv-pair${mode === "pair" ? " is-active" : ""}`} aria-hidden={mode !== "pair"}>
        <h1 className="tv-eyebrow">Pair this screen</h1><div className="tv-code" aria-label={status.status === "pair" ? `Pairing code ${status.code.split("").join(" ")}` : "Pairing code"}>{(status.status === "pair" ? status.code : "      ").split("").map((digit, i) => <span key={i} className={i === 3 ? "has-gap" : ""}>{digit}</span>)}</div>
        <p className="tv-body">On your laptop, open your engagement and choose <strong>Pair a TV</strong>. Enter this code.</p>
      </section>
      <section className={`tv-scene tv-holding${mode === "holding" ? " is-active" : ""}`} aria-hidden={mode !== "holding"}>
        <p className="tv-eyebrow">{display?.title}</p><h1 className="tv-headline-xl"><strong>{display?.church}</strong></h1><p className="tv-body tv-muted"><Check aria-hidden="true" /> This screen is paired</p>
      </section>
      <section className={`tv-scene tv-join${mode === "join" ? " is-active" : ""}`} aria-hidden={mode !== "join"}>
        {display && <><Qr code={display.room_code} /><div><p className="tv-eyebrow">{display.church}</p><h1 className="tv-join-link" aria-label={link.replace("https://", "")}><span>live.clearway.co</span><span>/r/{display.room_code}</span></h1><p className="tv-body tv-muted">Scan the code or type the link. No app needed.</p><div className="tv-names" aria-live="polite">{presence?.names.length ? presence.names.slice(0, nameLimit).map(person => <span key={person.key} data-name-key={person.key}>{person.name}</span>) : <span>Waiting for the first phone</span>}{(presence?.count || 0) > nameLimit && <span>+ {(presence?.count || 0) - nameLimit} more</span>}</div></div></>}
      </section>
      <section className={`tv-scene tv-session${mode === "session" ? " is-active" : ""}`} aria-hidden={mode !== "session"}>
        <SessionLayers frame={paired ? frame : null} flow={flow} />
      </section>
      <section className={`tv-scene tv-opening${mode === "opening" ? " is-active" : ""}`} aria-hidden={mode !== "opening"}><h1 className="tv-headline">{status.status === "closed" ? "This engagement has closed" : "Opening this screen"}</h1></section>
    </div>
    <section className={`tv-check${mode === "screen_check" ? " is-active" : ""}`} aria-hidden={mode !== "screen_check"}>
      <div className="tv-check-edge" /><div className="tv-check-safe" />{["tl", "tr", "bl", "br"].map(corner => <div key={corner} className={`tv-check-corner ${corner}`} />)}<div className="tv-check-circle" /><div className="tv-check-cross" /><div className="tv-check-cross is-horizontal" />
      <div className="tv-type-ladder">{[["display", "Aa 8", "144"], ["headline-xl", "Grow", "96"], ["headline", "Where is God", "64"], ["main", "Welcoming culture", "56"], ["body", "Small groups in homes", "44"], ["floor", "23 answers", "36"], ["upclose", "Reconnecting (up close only)", "24"]].map(([type, text, size]) => <div key={type}><small>{type} · {size}px</small><span className={`tv-type-${type}`}>{text}</span></div>)}</div>
      <div className="tv-check-label"><h1 className="tv-eyebrow">Screen check</h1><p className="tv-body">Every Lime corner should be fully visible.</p><p className="tv-floor">The circle should look round. Choose Just Scan, Screen Fit or 1:1 on your TV.</p></div>
    </section>
    {paired && <Spotlight frame={frame} />}
    <footer className="tv-foot"><span className="tv-upclose">{mode === "pair" ? "live.clearway.co/tv" : ""}</span>{status.status === "pair" && <CodeExpiry expires={status.expires_at} />}<span className={`tv-reconnecting tv-upclose${reconnecting ? " is-on" : ""}`} role="status"><RefreshCw aria-hidden="true" />Reconnecting</span></footer>
  </>;
}

"use client";
import { createContext, useContext } from "react";
import Image from "next/image";
import { Smartphone } from "lucide-react";
import { boldParts, contentOf, outlineRows } from "@/lib/interactions/kinds";
import { mediaUrl } from "@/lib/interactions/media";
import type { LiveSnapshot } from "@/lib/live/types";

// Which signed-in surface is drawing the TV: the TV itself, the control surface's
// mirror, or a phone showing the TV view. Images are read with that surface's session.
export const MediaSurface = createContext<"tv" | "phone" | "control">("tv");

export function Bold({ text }: { text: string }) {
  return <>{boldParts(text).map((part, i) => part.bold ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>)}</>;
}

// The screen check: edge lines, a circle and a type ladder for setting up the TV.
export function ScreenCheck() {
  return <div className="tv-check-inner">
    <div className="tv-check-edge" /><div className="tv-check-safe" />{["tl", "tr", "bl", "br"].map(corner => <div key={corner} className={`tv-check-corner ${corner}`} />)}<div className="tv-check-circle" /><div className="tv-check-cross" /><div className="tv-check-cross is-horizontal" />
    <div className="tv-type-ladder">{[["display", "Aa 8", "144"], ["headline-xl", "Grow", "96"], ["headline", "Where is God", "64"], ["main", "Welcoming culture", "56"], ["body", "Small groups in homes", "44"], ["floor", "23 answers", "36"], ["upclose", "Up close only", "24"]].map(([type, text, size]) => <div key={type}><small>{type} · {size}px</small><span className={`tv-type-${type}`}>{text}</span></div>)}</div>
    <div className="tv-check-label"><h1 className="tv-eyebrow">Screen check</h1><p className="tv-body">Every Lime corner should be fully visible.</p><p className="tv-floor">The circle should look round. Choose Just Scan, Screen Fit or 1:1 on your TV.</p></div>
  </div>;
}

// Content screens (no input). Each is still: nothing on them moves except a change the
// facilitator saves, which cross-fades with the session layer.
export function ContentScreen({ frame }: { frame: LiveSnapshot }) {
  const session = frame.session!, o = contentOf(session.options), surface = useContext(MediaSurface);
  const church = frame.display?.church ?? "";
  switch (o.screen) {
    case "scripture":
      return <div className="tv-content tv-scripture">
        <p className={o.size === "body" ? "tv-passage is-body" : "tv-passage"}><Bold text={session.prompt} /></p>
        {(o.reference || o.translation) && <p className="tv-reference">{o.reference && <b>{o.reference}</b>}{o.translation && <span>{o.translation}</span>}</p>}
      </div>;
    case "prayer":
      return <div className="tv-content tv-prayer">{session.prompt.trim() && <h1 className="tv-headline"><Bold text={session.prompt} /></h1>}</div>;
    case "image":
      return <div className="tv-content tv-docpage">
        {o.media ? <Image unoptimized className="tv-page" src={mediaUrl(frame.state.engagement_id, o.media, surface)} alt={session.prompt || session.title} width={1600} height={900} />
          : <p className="tv-body tv-muted">{session.prompt || session.title}</p>}
        {frame.display && <span className="tv-corner-link tv-upclose"><Smartphone aria-hidden="true" />live.clearway.co/{frame.display.room_code}</span>}
      </div>;
    case "screen_check":
      return <div className="tv-content" />;
    case "holding": {
      const rows = o.outline ? outlineRows(o.outline) : [];
      return <div className="tv-content tv-holding-screen">
        <p className="tv-eyebrow">{session.title}</p>
        <h1 className="tv-headline-xl">{session.prompt.trim() ? <Bold text={session.prompt} /> : <>Welcome to <strong>{church}</strong></>}</h1>
        {rows.length > 6 ? <div className="tv-outline-cols">{[rows.slice(0, Math.ceil(rows.length / 2)), rows.slice(Math.ceil(rows.length / 2))].map((column, c) =>
            <div key={c} className="tv-outline">{column.map((row, i) => <div key={i} className="tv-outline-row"><b>{row.time}</b><span>{row.text}</span></div>)}</div>)}</div>
          : rows.length > 0 ? <div className="tv-outline">{rows.map((row, i) => <div key={i} className="tv-outline-row"><b>{row.time}</b><span>{row.text}</span></div>)}</div>
          : o.line && <p className="tv-body tv-muted tv-holding-line">{o.line}</p>}
      </div>;
    }
    default:
      return <div className={`tv-content tv-depth${o.number ? " has-number" : ""}`}>
        {o.number && <div className="tv-big-number">{o.number}</div>}
        <div><p className="tv-eyebrow">{session.title}</p><h1 className="tv-headline-xl tv-content-text"><Bold text={session.prompt} /></h1>{o.source && <p className="tv-source">{o.source}</p>}</div>
      </div>;
  }
}

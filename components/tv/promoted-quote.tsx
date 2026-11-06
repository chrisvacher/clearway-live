"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LiveSnapshot, PromotedQuote } from "@/lib/live/types";
import { tokenMs } from "@/lib/tv/board";
import { quoteParts } from "@/lib/quote/promoted";

// PromotedQuote (FAC-01 on the TV): a scribe quote, anonymous, in the pass 3 spotlight (the Navy scrim and
// the Sunrise card) with the Scripture screen's treatment: light, with the second half bold. It is an
// overlay. The live step underneath keeps running and taking answers; taking the quote down plays the
// spotlight's reverse and the step is exactly as it was. A second quote crossfades over the first.
type Layer = { id: number; quote: PromotedQuote; on: boolean; swap?: boolean };

// The words wrap at headline size and shrink until the card fits the screen, then widen, then run in two
// columns. Nothing clips: the smallest size is the TV's up-close size, reached only by the longest quotes.
const CARD_MAX = 832, NARROW = 56, FLOOR = 36, LAST_RESORT = 24;
export type QuoteMode = { wide: boolean; columns: boolean };
export function fitQuote(card: HTMLElement, text: HTMLElement): QuoteMode {
  text.style.fontSize = "";
  const base = parseFloat(getComputedStyle(text).fontSize) || 64;
  const sizes: number[] = [];
  for (let size = base; size > LAST_RESORT; size *= 0.94) sizes.push(size);
  sizes.push(LAST_RESORT);
  const fits = () => card.offsetHeight <= CARD_MAX && card.scrollWidth <= card.clientWidth + 1;
  for (const size of sizes) {
    const mode = { wide: size < NARROW, columns: size < FLOOR };
    card.classList.toggle("is-wide", mode.wide);
    card.classList.toggle("is-columns", mode.columns);
    text.style.fontSize = `${size}px`;
    if (fits()) return mode;
  }
  return { wide: true, columns: true };
}

function QuoteCard({ layer, session, roomSize }: { layer: Layer; session: string; roomSize: string | undefined }) {
  const card = useRef<HTMLDivElement>(null), text = useRef<HTMLParagraphElement>(null);
  // The measured mode is kept in state, so React's class list and the one the fit measured are the same.
  const [mode, setMode] = useState<QuoteMode>({ wide: false, columns: false });
  useLayoutEffect(() => { if (card.current && text.current) setMode(fitQuote(card.current, text.current)); }, [layer.quote.text, layer.quote.session, roomSize]);
  const [lead, bold] = quoteParts(layer.quote.text);
  return <div ref={card} className={`tv-spot pq-spot${mode.wide ? " is-wide" : ""}${mode.columns ? " is-columns" : ""}${layer.on ? " is-on" : ""}${layer.swap ? " is-swap" : ""}`} data-testid="promoted-quote" aria-hidden={!layer.on} role={layer.on ? "status" : undefined}>
    <p className="tv-spot-eyebrow">From the room</p>
    <p ref={text} className="pq-text"><span>“{lead}</span>{bold ? <> <strong>{bold}”</strong></> : <>”</>}</p>
    {session && <p className="tv-spot-meta pq-session">{session}</p>}
  </div>;
}

export function PromotedQuoteSpot({ frame }: { frame: LiveSnapshot | null }) {
  const quote = frame?.promoted_quote ?? null, key = quote ? `${quote.session}\n${quote.text}` : "";
  const [layers, setLayers] = useState<Layer[]>(() => quote ? [{ id: 1, quote, on: true }] : []);
  const seq = useRef(1), shown = useRef(key), box = useRef<HTMLDivElement>(null), latest = useRef(quote);
  latest.current = quote;
  // A new quote joins behind a quiet frame. Once it has painted, it fades in and the old one fades out in the
  // same update, so the two always cross together however busy the machine is. None is a fade out.
  useEffect(() => {
    if (shown.current === key) return;
    shown.current = key;
    const quote = latest.current;
    if (!quote) { setLayers(current => current.map(layer => ({ ...layer, on: false }))); return; }
    const id = ++seq.current;
    setLayers(current => [...current, { id, quote, on: false }]);
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setLayers(current => current.map(layer => layer.id === id ? { ...layer, on: true } : layer.id < id ? { ...layer, on: false, swap: true } : layer))));
    return () => cancelAnimationFrame(raf);
  }, [key]);
  // Layers that have faded out leave. The newest quote waits for its turn and is never swept away.
  useEffect(() => {
    if (layers.every(layer => layer.on)) return;
    const wait = box.current ? Math.max(tokenMs(box.current, "cwl-dur-spotlight-on"), tokenMs(box.current, "cwl-dur-spotlight-off")) + 80 : 700;
    const timer = setTimeout(() => setLayers(current => current.filter(layer => layer.on || layer.id === seq.current && shown.current !== "")), wait);
    return () => clearTimeout(timer);
  }, [layers]);
  const roomSize = frame?.display?.room_size;
  return <div ref={box} className="pq-layers">
    <div className={`tv-scrim pq-scrim${quote ? " is-on" : ""}`} aria-hidden="true" />
    {layers.map(layer => <QuoteCard key={layer.id} layer={layer} session={layer.quote.session} roomSize={roomSize} />)}
  </div>;
}

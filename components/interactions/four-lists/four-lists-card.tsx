"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { reducedMotion, tokenMs } from "@/lib/tv/board";
import { agreeWords, type FlCard } from "@/lib/interactions/four-lists";
import { AiMark } from "@/components/interactions/ai/ai-icon";

// A count that ticks up to the server's number over cwl-dur-count. Reduced motion shows the final number at once.
function useTicking(value: number, host: React.RefObject<HTMLElement | null>) {
  const [shown, setShown] = useState(value), from = useRef(value), frame = useRef(0);
  useEffect(() => {
    const el = host.current, start = from.current;
    cancelAnimationFrame(frame.current);
    if (!el || start === value || reducedMotion(el)) { from.current = value; setShown(value); return; }
    const ms = Math.max(1, tokenMs(el, "cwl-dur-count")), t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms), n = Math.round(start + (value - start) * p);
      from.current = n; setShown(n);
      if (p < 1) frame.current = requestAnimationFrame(step); else from.current = value;
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [value, host]);
  return shown;
}

// One card on the TV: the words, the agreement count, and (once AI grouped it) how many cards it holds. The element is kept
// as the board changes, so it can glide to its new place and swell when its count rises. The swell uses the separate scale
// property, so it never replaces the glide's transform. Only words and counts: no name.
// The count's width is fixed by its final number, so ticking up never re-wraps the words.
export function FourListsCard({ card, newest, settling }: { card: FlCard; newest: boolean; settling: boolean }) {
  const ref = useRef<HTMLDivElement>(null), seen = useRef(card.agree);
  const count = useTicking(card.agree, ref);
  useEffect(() => {
    const el = ref.current;
    if (el && card.agree > seen.current && !reducedMotion(el)) el.animate([{ scale: "1" }, { scale: "1.04" }, { scale: "1" }], { duration: tokenMs(el, "cwl-dur-swell"), easing: "cubic-bezier(0.25, 0.1, 0.25, 1)" });
    seen.current = card.agree;
  }, [card.agree]);
  return <div ref={ref} className={`fl-card${newest ? " is-newest" : ""}${settling ? " is-settling" : ""}`} data-card={card.id} data-agree={card.agree} data-ai={card.ai ? "true" : undefined} aria-label={`${card.text}, ${agreeWords(card.agree)}`}>
    <span className="fl-tx">{card.text}</span>
    <span className="fl-ft">
      {card.held > 1 && <span className="fl-ai" aria-label={`${card.held} cards grouped`}><AiMark label="Grouped by AI" /><span>{card.held}</span></span>}
      <span className={`fl-agree${card.agree ? "" : " is-zero"}`} aria-hidden="true"><ArrowUp aria-hidden="true" /><b data-digits={String(card.agree).length}>{count}</b></span>
    </span>
  </div>;
}

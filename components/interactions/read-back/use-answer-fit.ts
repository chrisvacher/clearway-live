"use client";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { answerSize, fitCount } from "@/lib/tv/fit";

// How many of the read-back's "What's missing?" answers show whole in the side column, and how large their type is.
// The answers are measured at the list's own width and height, in layout pixels (the TV stage may be scaled by a transform), and
// the count is a plain function of those boxes and the words: nothing it measures depends on a count it has already made, so it
// cannot drift while the room is quiet. The side column's type starts at the room's size; when fewer than the answers asked for
// (up to six) fit whole, it steps down toward the floor of the type ramp until they do. Below the floor it never goes: the rest
// are counted on the "+ n more on phones" line. The "+ n more" line takes its height from the list, so a pass that adds or
// removes it is followed by one more pass (the observer on the list); the second pass can only shrink the list, never undo itself.
// Runs before paint on every change of the words, and whenever the column, the list or the type fonts change size.
const floorPx = 36;
export function useAnswerFit(side: RefObject<HTMLElement | null>, list: RefObject<HTMLElement | null>, sign: string, items: number): number {
  const [fit, setFit] = useState(items);
  const run = useRef<() => number | null>(() => null);
  run.current = () => {
    const s = side.current, l = list.current, heading = s?.querySelector<HTMLElement>(".rbk-missing-h");
    if (!s || !l || !heading) return null;
    s.style.setProperty("--rbk-side-fit", "1");
    const most = parseFloat(getComputedStyle(heading).fontSize);
    if (!(most > 0)) return null;
    const kids = Array.from(l.children) as HTMLElement[];
    // Layout pixels: undo any transform scale of the stage with the list's own width.
    const unit = () => l.getBoundingClientRect().width / (l.offsetWidth || 1) || 1;
    const count = () => {
      const u = unit(), gap = parseFloat(getComputedStyle(l).rowGap) || 0;
      return fitCount(kids.map(k => k.getBoundingClientRect().height / u), gap, l.getBoundingClientRect().height / u, "start", 0);
    };
    const px = answerSize(size => { s.style.setProperty("--rbk-side-fit", String(Math.min(1, size / most))); return count() >= kids.length; }, floorPx, most);
    s.style.setProperty("--rbk-side-fit", String(Math.min(1, px / most)));
    return count();
  };
  // Before paint on every render whose inputs changed: the words, or the column's own box (the room size, the TV's fit, the lines' fit).
  // None of these is moved by the type step this hook sets, so a pass never feeds the next.
  const seen = useRef("");
  // No dependency list on purpose: the column's box can change on any render (the TV's own fit step moves it), and the key below is the check.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const s = side.current, key = `${sign}|${s?.clientWidth}x${s?.clientHeight}|${items}`;
    if (key === seen.current) return;
    const n = run.current();
    if (n === null) return;
    seen.current = key;
    setFit(prev => prev === n ? prev : n);
  });
  useEffect(() => {
    const s = side.current, l = list.current;
    if (!s || !l) return;
    const again = () => { const n = run.current(); if (n !== null) flushSync(() => setFit(prev => prev === n ? prev : n)); };
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver === "function") { ro = new ResizeObserver(again); ro.observe(s); ro.observe(l); }
    // The type fonts arrive after the first paint on a cold screen; the answers are measured again in their real face.
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    void fonts?.ready.then(again);
    fonts?.addEventListener?.("loadingdone", again);
    return () => { ro?.disconnect(); fonts?.removeEventListener?.("loadingdone", again); };
  }, [side, list]);
  return Math.min(fit, items);
}

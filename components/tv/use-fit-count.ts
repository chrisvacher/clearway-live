"use client";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { fitCount } from "@/lib/tv/fit";

// How many of a list's children fit whole in the list's own box (lib/tv/fit). The list is a flex
// child that takes the space left after its neighbours, so its height never depends on its items.
// Children that do not fit stay in the page, out of the flow and unseen, so they are measured at the
// list's width and come back the moment there is room again. Measured before paint whenever the
// number of items changes and whenever the list or an item changes size (room size, the TV's fit,
// a bullet growing as it is typed), so nothing is ever drawn running past its space.
export function useFitCount(ref: RefObject<HTMLElement | null>, items: number, from: "start" | "end", least = 1): number {
  const [fit, setFit] = useState(items);
  const watch = useRef<{ el: Element | null; seen: Set<Element>; resize: ResizeObserver | null; added: MutationObserver | null }>({ el: null, seen: new Set(), resize: null, added: null });
  const measure = () => {
    const el = ref.current;
    if (!el) return items;
    const kids = Array.from(el.children) as HTMLElement[];
    return fitCount(kids.map(k => k.offsetHeight), parseFloat(getComputedStyle(el).rowGap) || 0, el.clientHeight, from, least);
  };
  const latest = useRef(measure);
  latest.current = measure;
  // On a change in the number of items, before paint; every other change of size (a bullet growing as it is
  // typed, the room size, the TV's fit) reaches the observer below, also before paint.
  useLayoutEffect(() => {
    const el = ref.current, w = watch.current;
    // Watch the list and each of its children for size changes; a list that is swapped for
    // another (a different outcome's screen) is watched afresh.
    if (el !== w.el) {
      w.resize?.disconnect(); w.added?.disconnect(); w.seen = new Set(); w.el = el; w.resize = w.added = null;
      if (el && typeof ResizeObserver === "function") {
        const follow = () => { for (const kid of Array.from(el.children)) if (!w.seen.has(kid)) { w.seen.add(kid); w.resize?.observe(kid); } };
        w.resize = new ResizeObserver(() => { follow(); const n = latest.current(); flushSync(() => setFit(prev => prev === n ? prev : n)); });
        w.resize.observe(el); w.seen.add(el); follow();
        w.added = new MutationObserver(follow); w.added.observe(el, { childList: true });
      }
    }
    const n = latest.current();
    setFit(prev => prev === n ? prev : n);
  }, [ref, items]);
  useEffect(() => () => { watch.current.resize?.disconnect(); watch.current.added?.disconnect(); }, []);
  return Math.min(fit, items);
}

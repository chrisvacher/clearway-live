"use client";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

// Pass 6 motion for themes (motion spec 2 and 3). Every duration and easing is a Clearway Live token, read from the page.
// Reduced motion (the setting in the app or the browser) turns movement into nothing: the list just changes.
const token = (name: string, fallback: string) => (typeof document === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue(name).trim()) || fallback;
const ms = (name: string, fallback: number) => { const v = token(name, ""); const n = parseFloat(v); return Number.isFinite(n) ? (/\bs$/.test(v) && !/ms$/.test(v) ? n * 1000 : n) : fallback; };
export const reducedMotion = () => typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.getAttribute("data-motion") === "reduced" || document.querySelector('[data-motion="reduced"]') !== null;

// FLIP for a keyed list: items trade places by gliding (cwl-dur-make-room), and a new one arrives (cwl-dur-arrive). The first
// render and a reduced-motion setting do neither. Positions are offsets inside the list, so a scrolled page does not fool it.
export function useFlip(list: RefObject<HTMLElement | null>, keys: string[]) {
  const seen = useRef<Map<string, number> | null>(null);
  const sign = keys.join("|");
  useLayoutEffect(() => {
    const host = list.current; if (!host) return;
    const next = new Map<string, number>(), before = seen.current;
    host.querySelectorAll<HTMLElement>(":scope > [data-k]").forEach(el => next.set(el.dataset.k!, el.offsetTop));
    if (before && !reducedMotion()) {
      host.querySelectorAll<HTMLElement>(":scope > [data-k]").forEach(el => {
        const key = el.dataset.k!, was = before.get(key), now = next.get(key)!;
        if (el.getAnimations().length) return;
        if (was === undefined) el.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: ms("--cwl-dur-arrive", 500), easing: token("--cwl-ease-signature", "ease") });
        else if (Math.abs(was - now) > 1) el.animate([{ transform: `translateY(${was - now}px)` }, { transform: "none" }], { duration: ms("--cwl-dur-make-room", 700), easing: token("--cwl-ease-signature", "ease") });
      });
    }
    seen.current = next;
  }, [list, sign]);
}

// A number that rolls from its old value to its new one (cwl-dur-bar-grow), so a count that grows is seen growing.
export function useRoll(value: number) {
  const [shown, setShown] = useState(value), from = useRef(value);
  useEffect(() => {
    if (value === from.current) return;
    if (reducedMotion()) { from.current = value; setShown(value); return; }
    const start = performance.now(), a = from.current, b = value, d = ms("--cwl-dur-bar-grow", 600);
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / d);
      setShown(Math.round(a + (b - a) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(step); else from.current = b;
    };
    frame = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(frame); from.current = value; };
  }, [value]);
  return shown;
}

// Rejecting: the theme fades and shrinks out (cwl-dur-hide, accelerating) and the list closes up. Resolves a function that brings it back if the reject did not happen.
export async function leave(el: HTMLElement | null): Promise<() => void> {
  if (!el || reducedMotion()) return () => {};
  const a = el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(0.96)" }], { duration: ms("--cwl-dur-hide", 400), easing: token("--cwl-ease-exit", "ease-in"), fill: "forwards" });
  await a.finished.catch(() => {});
  return () => a.cancel();
}

// Merging: the merged theme glides beneath its survivor while it fades (cwl-dur-regroup, calm); the survivor holds its focus ring; the
// counts then add with a roll. Resolves a function that puts everything back if the merge did not happen.
export async function glideInto(from: HTMLElement | null, into: HTMLElement | null): Promise<{ undo: () => void; settle: () => void }> {
  const none = { undo: () => {}, settle: () => {} };
  if (!from || !into || reducedMotion()) return none;
  const a = from.getBoundingClientRect(), b = into.getBoundingClientRect();
  into.classList.add("is-receiving");
  const anim = from.animate([{ transform: "none", opacity: 1 }, { transform: `translateY(${b.top - a.top}px) scale(0.96)`, opacity: 0 }],
    { duration: ms("--cwl-dur-regroup", 1200), easing: token("--cwl-ease-calm", "ease-in-out"), fill: "forwards" });
  await anim.finished.catch(() => {});
  return { undo: () => { anim.cancel(); into.classList.remove("is-receiving"); }, settle: () => into.classList.remove("is-receiving") };
}

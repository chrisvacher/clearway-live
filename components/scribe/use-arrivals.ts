"use client";
import { useEffect, useRef, useState } from "react";

// The ids that arrived after the list first showed, kept for the newest-arrival hold
// (cwl-dur-new-hold, 1200 ms) so a card lands with its moment. Cards already there at the start do not animate.
export function useArrivals(ids: string[], hold = 1200) {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const key = ids.join("|");
  useEffect(() => {
    if (seen.current === null) { if (ids.length === 0) return; seen.current = new Set(ids); return; }
    const added = ids.filter(id => !seen.current!.has(id));
    if (!added.length) return;
    added.forEach(id => seen.current!.add(id));
    setFresh(current => new Set([...current, ...added]));
    const timer = setTimeout(() => setFresh(current => { const next = new Set(current); added.forEach(id => next.delete(id)); return next; }), hold);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hold]);
  return fresh;
}

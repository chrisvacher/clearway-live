"use client";
import { useEffect, useRef } from "react";

// Asks again every few seconds while the page is on screen, and at once when the person comes back to it (the tab shows again, the window gets
// focus or the network returns). A tab the facilitator left to run the show from another window never ticks while it is hidden, so without the
// immediate read it would still show the state it had when they left. The database stays the one truth; this only keeps the page in step.
export function usePoll(refresh: () => void | Promise<void>, ms: number, enabled = true) {
  const latest = useRef(refresh);
  useEffect(() => { latest.current = refresh; });
  useEffect(() => {
    if (!enabled) return;
    const run = () => { if (document.visibilityState === "visible") void latest.current(); };
    const timer = setInterval(run, ms);
    document.addEventListener("visibilitychange", run);
    window.addEventListener("focus", run);
    window.addEventListener("online", run);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", run); window.removeEventListener("focus", run); window.removeEventListener("online", run); };
  }, [ms, enabled]);
}

// The page's rhythm: every 6 seconds, every 3 while a draft is running.
export const POLL_MS = 6000;
export const POLL_ACTIVE_MS = 3000;

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ThemesState } from "@/lib/discover/themes";
import { POLL_ACTIVE_MS, POLL_MS, usePoll } from "./use-poll";

export type ThemeReply = { status: string; message?: string } & Record<string, unknown>;
type Load = { state: ThemesState | null; missing: boolean };

// Reads and writes the themes through the app's own route, under the facilitator's sign-in. The page asks every 3 seconds while a draft
// is running and every 6 otherwise, and at once when the tab shows again, so changes made elsewhere appear without a reload. If the themes functions are not in the database yet,
// `missing` is true and the page keeps showing the read-only list it had.
export function useThemes(engagement: string, initial: ThemesState | null, watch: string) {
  const [load, setLoad] = useState<Load>({ state: initial, missing: initial === null });
  const [clock, setClock] = useState(() => (initial ? Date.parse(initial.server_time) - Date.now() : 0));
  // One read at a time. A read asked for while another is in flight (a poll, a save) is not dropped: the one in flight is not applied (it began before the
  // change) and a fresh read follows, and whoever asked waits for it, so a saved change never flips back to what the page had.
  const loop = useRef<Promise<void> | null>(null), again = useRef(false);
  const refresh = useCallback((): Promise<void> => {
    if (loop.current) { again.current = true; return loop.current; }
    loop.current = (async () => {
      try {
        do {
          again.current = false;
          try {
            const response = await fetch(`/api/discover/${engagement}/themes`, { cache: "no-store" });
            const data = await response.json();
            if (again.current) continue;
            if (data?.status === "ok") { setLoad({ state: data as ThemesState, missing: false }); setClock(Date.parse(data.server_time) - Date.now()); }
            else if (data?.status === "missing") setLoad(l => ({ state: l.state, missing: l.state === null }));
          } catch { /* the page keeps what it shows */ }
        } while (again.current);
      } finally { loop.current = null; }
    })();
    return loop.current;
  }, [engagement]);
  const status = load.state?.round?.status;
  const active = status === "pending" || status === "drafting";
  usePoll(refresh, active ? POLL_ACTIVE_MS : POLL_MS, !load.missing);
  // A finding saved above changes the survey themes: read again.
  useEffect(() => { void refresh(); }, [refresh, watch]);
  const send = useCallback(async (body: Record<string, unknown>): Promise<ThemeReply> => {
    try {
      const response = await fetch(`/api/discover/${engagement}/themes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({ status: "unavailable" }));
      await refresh();
      return data;
    } catch { return { status: "unavailable", message: "We couldn't connect just now. Try again." }; }
  }, [engagement, refresh]);
  return { state: load.state, missing: load.missing, now: () => Date.now() + clock, refresh, send };
}

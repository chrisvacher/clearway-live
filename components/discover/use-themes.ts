"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ThemesState } from "@/lib/discover/themes";

export type ThemeReply = { status: string; message?: string } & Record<string, unknown>;
type Load = { state: ThemesState | null; missing: boolean };

// Reads and writes the themes through the app's own route, under the facilitator's sign-in. The page asks every 3 seconds while a draft
// is running and every 12 otherwise, so the other facilitator's changes appear. If the themes functions are not in the database yet,
// `missing` is true and the page keeps showing the read-only list it had.
export function useThemes(engagement: string, initial: ThemesState | null, watch: string) {
  const [load, setLoad] = useState<Load>({ state: initial, missing: initial === null });
  const [clock, setClock] = useState(() => (initial ? Date.parse(initial.server_time) - Date.now() : 0));
  const busy = useRef(false);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const response = await fetch(`/api/discover/${engagement}/themes`, { cache: "no-store" });
      const data = await response.json();
      if (data?.status === "ok") { setLoad({ state: data as ThemesState, missing: false }); setClock(Date.parse(data.server_time) - Date.now()); }
      else if (data?.status === "missing") setLoad(l => ({ state: l.state, missing: l.state === null }));
    } catch { /* the page keeps what it shows */ } finally { busy.current = false; }
  }, [engagement]);
  const status = load.state?.round?.status;
  const active = status === "pending" || status === "drafting";
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, active ? 3000 : 12000);
    return () => clearInterval(timer);
  }, [refresh, active]);
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

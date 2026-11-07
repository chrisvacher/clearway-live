"use client";
import { useCallback, useRef, useState } from "react";
import type { DiscoverState } from "@/lib/discover/types";
import { POLL_MS, usePoll } from "./use-poll";

export type Reply = { status: string; message?: string } & Record<string, unknown>;

// Reads and writes Discover through the app's own route, under the facilitator's sign-in. After a write it reads again, and it reads
// every few seconds while the page is on screen, so the notes, findings and total follow the database without a reload.
export function useDiscover(engagement: string, initial: DiscoverState) {
  const [state, setState] = useState(initial);
  const busy = useRef(false);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const response = await fetch(`/api/discover/${engagement}`, { cache: "no-store" });
      const data = await response.json();
      if (data?.status === "ok") setState(data as DiscoverState);
    } catch { /* the page keeps what it shows */ } finally { busy.current = false; }
  }, [engagement]);
  usePoll(refresh, POLL_MS);
  const send = useCallback(async (body: Record<string, unknown>): Promise<Reply> => {
    try {
      const response = await fetch(`/api/discover/${engagement}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({ status: "unavailable" }));
      if (data.status === "ok" || data.status === "duplicate") await refresh();
      return data;
    } catch { return { status: "unavailable", message: "We couldn't connect just now. Try again." }; }
  }, [engagement, refresh]);
  return { state, refresh, send };
}

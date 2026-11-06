"use client";
import { useCallback, useState } from "react";
import type { DiscoverState } from "@/lib/discover/types";

export type Reply = { status: string; message?: string } & Record<string, unknown>;

// Reads and writes Discover through the app's own route, under the facilitator's sign-in. After a write it reads again,
// so the page always shows what the database holds.
export function useDiscover(engagement: string, initial: DiscoverState) {
  const [state, setState] = useState(initial);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/discover/${engagement}`, { cache: "no-store" });
      const data = await response.json();
      if (data?.status === "ok") setState(data as DiscoverState);
    } catch { /* the page keeps what it shows */ }
  }, [engagement]);
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

"use client";
import { useCallback, useEffect, useState } from "react";
import type { Room } from "@/components/control/live-controls";
import type { AiAction, AiStatus } from "@/lib/interactions/ai";

// One reader of the AI panel per engagement and step, shared by every AI piece on the page
// (the panel, the lists, the remote), polled as a backstop and read again on each room version.
type Store = { status: AiStatus | null; listeners: Set<(s: AiStatus | null) => void>; timer?: ReturnType<typeof setInterval>; running: boolean; again: boolean };
const stores = new Map<string, Store>();
async function read(key: string, url: string) {
  const store = stores.get(key); if (!store) return;
  if (store.running) { store.again = true; return; }
  store.running = true;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (response.ok) { store.status = await response.json() as AiStatus; store.listeners.forEach(l => l(store.status)); }
  } catch { /* Keep the last status. */ } finally {
    store.running = false;
    if (store.again) { store.again = false; void read(key, url); }
  }
}

export const aiMessages: Record<string, string> = {
  engagement_off: "AI is off for this engagement. Turn it on in setup.", invalid_state: "That isn't available for this step.", filtered: "That name is screened by the word filter.",
  invalid_request: "Check the name: up to 40 characters and six words.", missing: "That is no longer there.", unavailable: "Couldn't reach the room. Try again.", denied: "Only a facilitator can do that.",
};

export function useAiStatus(room: Room, session?: string | null) {
  const engagement = room.show.context.id, live = room.frame?.state.live_session_id ?? null, target = session ?? live;
  const key = `${engagement}|${target ?? ""}`, url = `/api/control/${engagement}/ai${target ? `?session=${target}` : ""}`;
  const [status, setStatus] = useState<AiStatus | null>(() => stores.get(key)?.status ?? null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  useEffect(() => {
    let store = stores.get(key);
    if (!store) { store = { status: null, listeners: new Set(), running: false, again: false }; stores.set(key, store); }
    const listener = (s: AiStatus | null) => setStatus(s);
    store.listeners.add(listener); setStatus(store.status);
    if (!store.timer) { store.timer = setInterval(() => void read(key, url), 3000); void read(key, url); }
    return () => { const s = stores.get(key); if (!s) return; s.listeners.delete(listener); if (!s.listeners.size) { clearInterval(s.timer); stores.delete(key); } };
  }, [key, url]);
  const version = room.frame?.version;
  useEffect(() => { if (version === undefined) return; const t = setTimeout(() => void read(key, url), 200); return () => clearTimeout(t); }, [version, key, url]);
  const press = useCallback(async (action: AiAction, extra: Record<string, unknown> = {}) => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/control/${engagement}/ai`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: crypto.randomUUID(), action, ...extra }) });
      const data = await response.json() as { status: string };
      if (!["ok", "unchanged", "duplicate"].includes(data.status)) setMessage(aiMessages[data.status] ?? aiMessages.unavailable);
      void read(key, url);
      return data;
    } catch { setMessage(aiMessages.unavailable); return { status: "unavailable" }; }
    finally { setBusy(false); }
  }, [engagement, key, url]);
  return { status, busy, message, press };
}

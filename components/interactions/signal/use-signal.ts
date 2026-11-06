"use client";
import { useCallback, useEffect, useState } from "react";
import type { Room } from "@/components/control/live-controls";
import { pressId } from "@/lib/control/own-presses";
import { signalMessages, type SignalAction, type SignalState } from "@/lib/interactions/signal";

// One reader of the alignment signal per engagement and step, shared by the panel and the remote's list, polled as a
// backstop, read again on each room version and the moment a private signal notice arrives. If the read is not there (the
// migration has not run, answered as a 404, or this person is not the lead or a co-facilitator) the status stays empty and nothing renders.
type Store = { status: SignalState | null; listeners: Set<(s: SignalState | null) => void>; timer?: ReturnType<typeof setInterval>; running: boolean; again: boolean };
const stores = new Map<string, Store>();
async function read(key: string, url: string) {
  const store = stores.get(key); if (!store) return;
  if (store.running) { store.again = true; return; }
  store.running = true;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (response.ok) { const data = await response.json() as SignalState; if (data.status === "ok") { store.status = data; store.listeners.forEach(l => l(store.status)); } }
    else if (response.status === 403 || response.status === 404) { store.status = null; store.listeners.forEach(l => l(null)); }
  } catch { /* Keep the last status. */ } finally {
    store.running = false;
    if (store.again) { store.again = false; void read(key, url); }
  }
}

export function useSignal(room: Room) {
  const engagement = room.show.context.id, live = room.frame?.state.live_session_id ?? null;
  const key = `${engagement}|${live ?? ""}`, url = `/api/control/${engagement}/signal${live ? `?session=${live}` : ""}`;
  const [status, setStatus] = useState<SignalState | null>(() => stores.get(key)?.status ?? null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  useEffect(() => {
    let store = stores.get(key);
    if (!store) { store = { status: null, listeners: new Set(), running: false, again: false }; stores.set(key, store); }
    const listener = (s: SignalState | null) => setStatus(s);
    store.listeners.add(listener); setStatus(store.status);
    if (!store.timer) { store.timer = setInterval(() => void read(key, url), 3000); void read(key, url); }
    return () => { const s = stores.get(key); if (!s) return; s.listeners.delete(listener); if (!s.listeners.size) { clearInterval(s.timer); stores.delete(key); } };
  }, [key, url]);
  const version = room.frame?.version, tick = room.signalTick;
  useEffect(() => { if (version === undefined) return; const t = setTimeout(() => void read(key, url), 200); return () => clearTimeout(t); }, [version, key, url]);
  useEffect(() => { if (tick) void read(key, url); }, [tick, key, url]);
  const press = useCallback(async (action: SignalAction, extra: { signal?: string; text?: string } = {}) => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/control/${engagement}/signal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: pressId(), action, ...extra }) });
      const data = await response.json() as { status: string };
      if (!["ok", "unchanged", "duplicate"].includes(data.status)) setMessage(signalMessages[data.status] ?? signalMessages.unavailable);
      void read(key, url);
      return data;
    } catch { setMessage(signalMessages.unavailable); return { status: "unavailable" }; }
    finally { setBusy(false); }
  }, [engagement, key, url]);
  return { status, busy, message, press, clearMessage: () => setMessage("") };
}

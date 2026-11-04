"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type IntentPerson = { id: string; first: string };
export type IntentLock = { field: string; by: string; mine: boolean };
export type IntentCardState = { id: string; pair: IntentPerson[]; locks: IntentLock[] };
export type IntentViewState = { status: string; me?: string; kind?: string; cards: IntentCardState[]; people: IntentPerson[] };
export type RemoteState = { status: string; active?: boolean; holder?: "team" | "lead"; via?: "room" | "followup"; designee?: string; lead?: string; designee_id?: string; i_am_designee?: boolean; i_hold?: boolean;
  block?: { id: string; title: string; interaction: string; state: string }[]; ends_at?: string | null; live_session_id?: string | null };

// The cards' pairs and field locks, and who holds the remote, read from the server. Re-read on
// every room change and every few seconds, so a lock that expires frees its field on its own.
export function useIntent(base: string, version: number | undefined, every = 2500) {
  const [view, setView] = useState<IntentViewState | null>(null), [remote, setRemote] = useState<RemoteState | null>(null);
  const busy = useRef(false);
  const read = useCallback(async () => {
    if (busy.current) return; busy.current = true;
    try {
      const response = await fetch(base, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (data?.view?.status === "ok") setView(data.view);
      if (data?.remote) setRemote(data.remote);
    } catch { /* The next read tries again. */ } finally { busy.current = false; }
  }, [base]);
  useEffect(() => { void read(); const t = setInterval(() => void read(), every); return () => clearInterval(t); }, [read, every]);
  useEffect(() => { void read(); }, [version, read]);
  return { view, remote, read };
}

export async function post(url: string, body: unknown): Promise<{ status: string; [key: string]: unknown }> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return await response.json().catch(() => ({ status: "unavailable" }));
  } catch { return { status: "unavailable" }; }
}

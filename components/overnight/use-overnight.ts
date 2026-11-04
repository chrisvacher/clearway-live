"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ActResult, OvernightState } from "./types";
import { okStatus, resultMessage } from "@/lib/overnight/policy";

// The overnight review's connection: the state (read every three seconds, and straight after anything done here),
// the presence heartbeat (every twelve seconds; a lock is a presence seen in the last forty), and every change.
// Nothing changes locally: the screen follows what the server returns.
export function useOvernight(engagement: string) {
  const [state, setState] = useState<OvernightState | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const here = useRef({ place: "overview", editing: false });
  const loading = useRef(false), again = useRef(false);

  const load = useCallback(async () => {
    if (loading.current) { again.current = true; return; }
    loading.current = true;
    try {
      const response = await fetch(`/api/overnight/${engagement}`, { cache: "no-store" });
      const data = await response.json() as OvernightState;
      setState(data);
    } catch { setState(current => current ?? { status: "unavailable" }); }
    finally { loading.current = false; if (again.current) { again.current = false; void load(); } }
  }, [engagement]);

  const post = useCallback(async (body: Record<string, unknown>): Promise<ActResult> => {
    try {
      const response = await fetch(`/api/overnight/${engagement}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return await response.json() as ActResult;
    } catch { return { status: "unavailable" }; }
  }, [engagement]);

  const act = useCallback(async (body: Record<string, unknown>): Promise<ActResult> => {
    setBusy(true); setMessage("");
    const result = await post(body);
    setBusy(false);
    if (!okStatus(result.status)) setMessage(resultMessage(result));
    await load();
    return result;
  }, [post, load]);

  // Where this facilitator is, and whether a text box is open (which holds the section's lock).
  const move = useCallback(async (place: string, editing = false): Promise<ActResult> => {
    here.current = { place, editing };
    const result = await post({ action: "presence", ...here.current });
    if (result.status === "locked") { here.current = { place, editing: false }; setMessage(resultMessage(result)); }
    void load();
    return result;
  }, [post, load]);

  useEffect(() => { void load(); const t = setInterval(() => void load(), 3000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      void post({ action: "presence", ...here.current }).then(result => {
        if (result.status === "locked") { here.current = { ...here.current, editing: false }; setMessage(resultMessage(result)); }
      });
    };
    beat();
    const t = setInterval(beat, 12000);
    const show = () => { if (document.visibilityState === "visible") { beat(); void load(); } };
    document.addEventListener("visibilitychange", show);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", show); };
  }, [post, load]);

  return { state, message, setMessage, busy, act, move, reload: load };
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { planMessage, type PlanState } from "@/lib/plan/policy";

export type ActResult = { status: string; message?: string; kept?: number; id?: string };
const quiet = ["ok", "duplicate", "unchanged", "confirm"];

// The plan's connection: the state (read every two seconds while the plan is being drafted, every four otherwise, and straight after anything done
// here) and every change. Nothing changes locally: the screen follows what the server returns.
export function usePlan(engagement: string) {
  const [state, setState] = useState<PlanState | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const loading = useRef(false), again = useRef(false), working = useRef(false);

  const load = useCallback(async () => {
    if (loading.current) { again.current = true; return; }
    loading.current = true;
    try {
      const response = await fetch(`/api/control/${engagement}/plan`, { cache: "no-store" });
      const data = await response.json() as PlanState;
      working.current = data.status === "ok" && (data.round?.status === "pending" || data.round?.status === "drafting");
      setState(data);
    } catch { setState(current => current ?? { status: "unavailable" }); }
    finally { loading.current = false; if (again.current) { again.current = false; void load(); } }
  }, [engagement]);

  const act = useCallback(async (body: Record<string, unknown>): Promise<ActResult> => {
    setBusy(true); setMessage("");
    let result: ActResult;
    try {
      const response = await fetch(`/api/control/${engagement}/plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      result = await response.json() as ActResult;
    } catch { result = { status: "unavailable" }; }
    setBusy(false);
    if (!quiet.includes(result.status)) setMessage(result.message ?? planMessage(result.status));
    await load();
    return result;
  }, [engagement, load]);

  useEffect(() => {
    void load();
    let stop = false, timer: ReturnType<typeof setTimeout>;
    const tick = () => { timer = setTimeout(() => { if (stop) return; if (document.visibilityState === "visible") void load(); tick(); }, working.current ? 2000 : 4000); };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [load]);

  return { state, message, busy, act, load, clear: () => setMessage("") };
}
export type Api = ReturnType<typeof usePlan>;

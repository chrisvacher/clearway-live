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
  const again = useRef(false), working = useRef(false);

  // One read at a time. A call while a read is out marks that another is wanted and gets the promise of the whole run, so whoever awaits load() (the draft
  // buttons) is released only when the state read after its own change has landed.
  const flight = useRef<Promise<void> | null>(null);
  const load = useCallback((): Promise<void> => {
    if (flight.current) { again.current = true; return flight.current; }
    flight.current = (async () => {
      try {
        do {
          again.current = false;
          try {
            const response = await fetch(`/api/control/${engagement}/plan`, { cache: "no-store" });
            const data = await response.json() as PlanState;
            working.current = data.status === "ok" && (data.round?.status === "pending" || data.round?.status === "drafting");
            setState(data);
          } catch { setState(current => current ?? { status: "unavailable" }); }
        } while (again.current);
      } finally { flight.current = null; }
    })();
    return flight.current;
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

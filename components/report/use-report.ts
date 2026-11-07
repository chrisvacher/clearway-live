"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { reportMessage, type Candidate, type ReportState } from "@/lib/report/policy";

export type ActResult = { status: string; message?: string; kept?: number; edited?: number; n?: number; count?: number };
const quiet = ["ok", "duplicate", "unchanged", "confirm"];

// The report's connection: the state (read every two seconds while sections are being drafted, every four otherwise, and straight after anything
// done here) and every change. Nothing changes locally: the screen follows what the server returns, so a section that finishes drafting appears on its own.
export function useReport(engagement: string) {
  const [state, setState] = useState<ReportState | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const loading = useRef(false), again = useRef(false), working = useRef(false);

  const load = useCallback(async () => {
    if (loading.current) { again.current = true; return; }
    loading.current = true;
    try {
      const response = await fetch(`/api/control/${engagement}/report`, { cache: "no-store" });
      const data = await response.json() as ReportState;
      working.current = data.status === "ok" && (data.round?.status === "pending" || data.round?.status === "drafting");
      setState(data);
    } catch { setState(current => current ?? { status: "unavailable" }); }
    finally { loading.current = false; if (again.current) { again.current = false; void load(); } }
  }, [engagement]);

  const post = useCallback(async (body: Record<string, unknown>): Promise<ActResult> => {
    try {
      const response = await fetch(`/api/control/${engagement}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return await response.json() as ActResult;
    } catch { return { status: "unavailable" }; }
  }, [engagement]);

  const act = useCallback(async (body: Record<string, unknown>): Promise<ActResult> => {
    setBusy(true); setMessage("");
    const result = await post(body);
    setBusy(false);
    if (!quiet.includes(result.status)) setMessage(result.message ?? reportMessage(result.status));
    await load();
    return result;
  }, [post, load]);

  const candidates = useCallback(async (section: string): Promise<Candidate[]> => {
    try {
      const response = await fetch(`/api/control/${engagement}/report?candidates=${section}`, { cache: "no-store" });
      const data = await response.json() as { status: string; candidates?: Candidate[] };
      return data.status === "ok" ? data.candidates ?? [] : [];
    } catch { return []; }
  }, [engagement]);

  useEffect(() => {
    void load();
    let stop = false, timer: ReturnType<typeof setTimeout>;
    const tick = () => { timer = setTimeout(() => { if (stop) return; if (document.visibilityState === "visible") void load(); tick(); }, working.current ? 2000 : 4000); };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [load]);

  return { state, message, busy, act, load, candidates, clear: () => setMessage("") };
}
export type Api = ReturnType<typeof useReport>;

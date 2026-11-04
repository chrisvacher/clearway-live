"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { typeBatchMs } from "@/lib/interactions/outcomes";

// Sends what a phone has typed so the TV can show it letter by letter, without flooding the room:
// at most one request in flight, one every batch window (cwl-dur-type-batch, 120 ms), the newest
// text always last. The server answers "pending" when the room has not been told yet; the phone
// then nudges it after wait_ms so the last keystrokes never wait. A typed update that fails is not
// retried: the next keystroke carries the whole text, and Add sends the final answer by the outbox.
type Reply = { status: string; pending?: boolean; wait_ms?: number };
export type Typing = { text: string; id: string; outcome: string | null; locked: boolean };

export function useBulletTyping(engagement: string | undefined, session: string) {
  const [state, setState] = useState<Typing>({ text: "", id: crypto.randomUUID(), outcome: null, locked: false });
  const latest = useRef({ ...state, seq: 0, sent: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), nudge = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flight = useRef(false), last = useRef(0), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (timer.current) clearTimeout(timer.current); if (nudge.current) clearTimeout(nudge.current); }; }, []);

  const post = useCallback(async (body: Record<string, unknown>): Promise<Reply | null> => {
    if (!engagement) return null;
    try {
      const response = await fetch(`/api/live/${engagement}/type`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return await response.json() as Reply;
    } catch { return null; }
  }, [engagement]);

  const flush = useCallback(async () => {
    timer.current = null;
    const now = latest.current;
    if (flight.current || now.seq === now.sent || !now.outcome) return;
    flight.current = true; last.current = Date.now(); now.sent = now.seq;
    const reply = await post({ action: "type", id: now.id, session, outcome: now.outcome, text: now.text, seq: now.seq });
    flight.current = false;
    if (!alive.current) return;
    if (reply?.status === "locked") setState(s => ({ ...s, locked: true }));
    else if (reply?.status === "ok") setState(s => s.locked ? { ...s, locked: false } : s);
    if (reply?.status === "ok" && reply.pending) {
      if (nudge.current) clearTimeout(nudge.current);
      nudge.current = setTimeout(async () => { nudge.current = null; const again = await post({ action: "nudge", session }); if (again?.pending && alive.current) { nudge.current = setTimeout(() => post({ action: "nudge", session }), again.wait_ms ?? typeBatchMs); } }, reply.wait_ms ?? typeBatchMs);
    }
    if (latest.current.seq !== latest.current.sent && !timer.current) timer.current = setTimeout(flush, Math.max(0, typeBatchMs - (Date.now() - last.current)));
  }, [post, session]);

  const type = useCallback((text: string, outcome: string) => {
    const now = latest.current;
    if (!text.trim() && !now.text) return;
    const wasEmpty = !now.text.trim();
    now.text = text; now.seq += 1; if (wasEmpty || !now.outcome) now.outcome = outcome;
    setState(s => ({ ...s, text, outcome: now.outcome }));
    if (flight.current || timer.current) return;
    const wait = Math.max(0, typeBatchMs - (Date.now() - last.current));
    if (wait === 0) void flush(); else timer.current = setTimeout(flush, wait);
  }, [flush]);

  // After Add (or when the text is cleared) the next bullet starts fresh under a new id.
  const reset = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const id = crypto.randomUUID();
    latest.current = { text: "", id, outcome: null, locked: false, seq: 0, sent: 0 };
    setState({ text: "", id, outcome: null, locked: false });
  }, []);
  return { ...state, type, reset };
}

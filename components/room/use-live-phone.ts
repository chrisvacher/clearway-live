"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RoomStream } from "@/lib/live/stream";
import { clockSample } from "@/lib/live/protocol";
import type { LiveRead, LiveSnapshot, SubmissionRequest } from "@/lib/live/types";
import { browserStore, PhoneOutbox } from "@/lib/phone/outbox";
import { keepSettled, type SettledAnswer } from "@/lib/phone/policy";
import type { OutboxEntry, PhoneRoom } from "@/lib/phone/types";

// One phone in the live room: the shared room it follows, its own reached
// steps and answers, and its durable outbox.
export function useLivePhone(engagement: string) {
  const [frame, setFrame] = useState<LiveSnapshot | null>(null);
  const [mode, setMode] = useState("connecting");
  const [room, setRoom] = useState<PhoneRoom | null>(null);
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [settledAnswers, setSettledAnswers] = useState<SettledAnswer[]>([]);
  const [online, setOnline] = useState(true);
  const [fresh, setFresh] = useState(false);
  const clock = useRef({ offsetMs: 0, uncertaintyMs: 60000 });
  const outbox = useRef<PhoneOutbox | null>(null);
  const loadRoom = useRef<() => void>(() => {});
  const refreshBaseline = useRef<number | null>(null);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update(); window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  // The phone's own reached steps and answers.
  useEffect(() => {
    let stopped = false, running = false, again = false;
    async function load() {
      if (running) { again = true; return; } running = true;
      try {
        const started = Date.now(), response = await fetch(`/api/live/${engagement}/mine`, { cache: "no-store" });
        if (response.ok && !stopped) { const next = await response.json() as PhoneRoom; if (next.status === "ok") { setRoom(next); setSettledAnswers(list => keepSettled(list, started)); } }
      } catch { /* Keep the last view while offline. */ }
      finally { running = false; if (again && !stopped) { again = false; void load(); } }
    }
    loadRoom.current = () => void load(); void load();
    const timer = setInterval(() => void load(), 15000);
    return () => { stopped = true; clearInterval(timer); };
  }, [engagement]);

  // The shared room, exactly as the TV follows it.
  useEffect(() => {
    const stream = new RoomStream({
      read: async transport => {
        const sent = Date.now(), response = await fetch(`/api/live/${engagement}?surface=phone${transport ? "&transport=1" : ""}`, { cache: "no-store" });
        if (!response.ok) throw new Error(response.status === 403 ? "denied" : "unavailable");
        const data = await response.json() as LiveRead;
        clock.current = clockSample(sent, Date.now(), Date.parse(data.server_time));
        return data;
      },
      render: setFrame,
      mode: setMode,
    });
    stream.start();
    const resume = () => { if (document.visibilityState === "visible") { stream.resume(); outbox.current?.kick(); } };
    window.addEventListener("online", resume); document.addEventListener("visibilitychange", resume);
    return () => { stream.stop(); window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume); };
  }, [engagement]);

  // The durable outbox: one at a time, in the order written.
  useEffect(() => {
    const key = `cw-outbox-${engagement}`;
    setFresh(browserStore.get(key) === null);
    const box = new PhoneOutbox(key, async request => {
      const response = await fetch(`/api/live/${engagement}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
      if (response.status >= 500 || response.status === 403) throw new Error("retry");
      return await response.json() as { status: string };
    }, setEntries, (request, reason) => {
      if (!reason) setSettledAnswers(list => [...list.filter(a => a.id !== request.id), { id: request.id, session_id: request.session, text: request.text, revision: request.revision, withdrawn: request.action === "withdraw", settledAt: Date.now() }]);
      loadRoom.current();
    }, browserStore, () => navigator.onLine);
    outbox.current = box; setEntries(box.entries); box.kick();
    return () => { box.stop(); outbox.current = null; };
  }, [engagement]);

  // Refresh phones: reload when the version rises during this page's life. Drafts and the outbox are already on the phone.
  const refresh = frame?.state.phone_refresh_version ?? null;
  useEffect(() => {
    if (refresh === null) return;
    if (refreshBaseline.current === null) { refreshBaseline.current = refresh; return; }
    if (refresh > refreshBaseline.current) window.location.reload();
  }, [refresh]);

  // The reached steps change only when the room moves.
  const shape = frame ? `${frame.state.live_session_id}|${frame.session?.state}|${frame.session?.revision}` : "";
  useEffect(() => { if (shape) loadRoom.current(); }, [shape]);

  const submit = useCallback((request: Omit<SubmissionRequest, "sentAt" | "uncertaintyMs">) => {
    outbox.current?.add({ ...request, sentAt: new Date(Date.now() + clock.current.offsetMs).toISOString(), uncertaintyMs: Math.min(60000, clock.current.uncertaintyMs) });
  }, []);
  const dismiss = useCallback((id: string, revision: number) => outbox.current?.dismiss(id, revision), []);
  const answers = room ? [...room.answers.filter(a => !settledAnswers.some(s => s.id === a.id && s.revision > a.revision)), ...settledAnswers.filter(s => !room.answers.some(a => a.id === s.id && a.revision >= s.revision))] : settledAnswers;
  // Read the phone's own view again now (a self-paced session just opened or closed).
  const reload = useCallback(() => loadRoom.current(), []);
  return { frame, mode, room, answers, entries, online: online && mode !== "offline", fresh, submit, dismiss, reload, clockOffset: clock.current.offsetMs };
}

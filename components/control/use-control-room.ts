"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RoomStream } from "@/lib/live/stream";
import { clockSample, retryDelay } from "@/lib/live/protocol";
import type { LiveRead, LiveSnapshot, LiveTransport } from "@/lib/live/types";
import { subscribeFacilitator } from "@/lib/control/feed";
import { actionNames, confirmedVersion, isSyncing, neighbours, resultMessage, upNext } from "@/lib/control/policy";
import type { ControlAction, ControlNotice, ControlPress, ControlResult, ControlStatus } from "@/lib/control/types";
import type { RunOfShow } from "@/lib/run-of-show/types";
import { sortSessions } from "@/lib/run-of-show/policy";

export type Toast = { id: string; text: string };
const reloadAfterMs = 12000;

// One facilitator view of the room: the shared room state, what the TVs have
// confirmed, and the private status. Nothing here changes the room locally;
// every press is a server mutation and the screen follows what comes back.
export function useControlRoom(engagement: string, initialShow: RunOfShow) {
  const [frame, setFrame] = useState<LiveSnapshot | null>(null);
  const [mode, setMode] = useState("connecting");
  const [status, setStatus] = useState<ControlStatus | null>(null);
  const [show, setShow] = useState(initialShow);
  const [now, setNow] = useState(() => Date.now());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<ControlAction | null>(null);
  const [awaiting, setAwaiting] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [ackTick, setAckTick] = useState(0);
  const [lastOk, setLastOk] = useState<number | null>(null);
  const [connection, setConnection] = useState<LiveTransport | null>(null);
  const started = useRef(Date.now()), history = useRef(new Map<number, LiveSnapshot>()), appliedAt = useRef(new Map<number, number>());
  const acks = useRef(new Map<string, number>()), mine = useRef(new Set<string>()), clock = useRef({ offsetMs: 0 });
  const refreshStatus = useRef<() => void>(() => {}), refreshShow = useRef<() => void>(() => {});

  const toast = useCallback((text: string) => {
    const id = crypto.randomUUID();
    setToasts(list => [...list.slice(-2), { id, text }]);
    setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), 4000);
  }, []);

  // The shared room: the same stream, snapshots and fallback the TV uses.
  useEffect(() => {
    const stream = new RoomStream({
      read: async transport => {
        const sent = Date.now(), response = await fetch(`/api/live/${engagement}?surface=control${transport ? "&transport=1" : ""}`, { cache: "no-store" });
        if (!response.ok) throw new Error(response.status === 403 ? "denied" : "unavailable");
        const data = await response.json() as LiveRead;
        clock.current = clockSample(sent, Date.now(), Date.parse(data.server_time));
        if (data.connection) setConnection(data.connection);
        setLastOk(Date.now());
        return data;
      },
      render: value => {
        history.current.set(value.version, value); appliedAt.current.set(value.version, Date.now());
        for (const version of [...history.current.keys()].sort((a, b) => a - b).slice(0, -80)) { history.current.delete(version); appliedAt.current.delete(version); }
        setFrame(value);
      },
      mode: setMode,
    });
    stream.start();
    const resume = () => { if (document.visibilityState === "visible") stream.resume(); };
    window.addEventListener("online", resume); document.addEventListener("visibilitychange", resume);
    return () => { stream.stop(); window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume); };
  }, [engagement]);

  // Private status: TV confirmations, counts, items. Polled as the authoritative
  // backstop; private notices make it immediate.
  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout>, running = false, again = false, failures = 0;
    async function poll() {
      if (stopped) return; if (running) { again = true; return; } running = true; clearTimeout(timer);
      try {
        const response = await fetch(`/api/control/${engagement}`, { cache: "no-store" });
        if (!response.ok) throw new Error("status");
        const next = await response.json() as ControlStatus; if (stopped) return;
        setStatus(next); failures = 0;
        for (const screen of next.screens) if ((acks.current.get(screen.id) ?? 0) < screen.confirmed_version) acks.current.set(screen.id, screen.confirmed_version);
      } catch { failures++; }
      finally { running = false; if (!stopped) { if (again) { again = false; void poll(); } else timer = setTimeout(() => void poll(), failures ? retryDelay(failures) : 3000); } }
    }
    refreshStatus.current = () => void poll(); void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [engagement]);

  // Each room version may change counts and items; refresh at most once a second.
  const version = frame?.version;
  useEffect(() => { if (version === undefined) return; const t = setTimeout(() => refreshStatus.current(), 250); return () => clearTimeout(t); }, [version]);

  // The run of show: states move with every navigation press.
  useEffect(() => {
    let stopped = false, running = false;
    async function load() {
      if (running) return; running = true;
      try { const response = await fetch(`/api/run-of-show/${engagement}`, { cache: "no-store" }); if (response.ok && !stopped) { const next = await response.json() as RunOfShow; setShow({ ...next, sessions: sortSessions(next.sessions) }); } }
      catch { /* Keep the last run of show. */ } finally { running = false; }
    }
    refreshShow.current = () => void load();
    const timer = setInterval(() => void load(), 15000);
    return () => { stopped = true; clearInterval(timer); };
  }, [engagement]);
  const shape = frame ? `${frame.state.live_session_id}|${frame.session?.state}|${frame.session?.revision}|${frame.state.phones_down}` : "";
  useEffect(() => { if (shape) refreshShow.current(); }, [shape]);

  // Private notices: confirmations and the other remote's presses.
  const topic = status?.fac_topic ?? null;
  useEffect(() => {
    if (!connection || !topic) return;
    return subscribeFacilitator(connection, topic, (notice: ControlNotice) => {
      if (notice.kind === "ack") {
        if ((acks.current.get(notice.screen) ?? 0) < notice.version) { acks.current.set(notice.screen, notice.version); setAckTick(t => t + 1); }
        return;
      }
      if (notice.id && !mine.current.has(notice.id) && notice.by) toast(`${notice.by} pressed ${actionNames[notice.action] ?? notice.action}`);
      refreshStatus.current(); refreshShow.current();
    }, () => {});
  }, [connection, topic, toast]);

  // A burst ends on the server. Ask at the end time; the database decides.
  const burstEnds = frame?.state.burst_ends_at ?? null;
  useEffect(() => {
    if (!burstEnds) return;
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const tick = async (attempt = 0) => {
      if (stopped) return;
      try {
        const response = await fetch(`/api/live/${engagement}/tick?surface=control`, { method: "POST" });
        const data = await response.json() as { status: string; ms?: number };
        if (data.status === "early" && !stopped) timer = setTimeout(() => void tick(attempt), Math.min(60000, (data.ms ?? 250) + 100));
      } catch { if (!stopped && attempt < 6) timer = setTimeout(() => void tick(attempt + 1), retryDelay(attempt)); }
    };
    timer = setTimeout(() => void tick(), Math.max(0, Date.parse(burstEnds) - clock.current.offsetMs - Date.now() + 150));
    return () => { stopped = true; clearTimeout(timer); };
  }, [burstEnds, engagement]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);

  const confirmed = useMemo(() => status ? confirmedVersion(status.screens, acks.current) : null,
    // ackTick re-reads the mutable ack map after a notice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, ackTick]);
  // The mirror shows what the TV confirmed, never what was asked for.
  const mirror = useMemo(() => {
    if (!frame || confirmed === null) return frame;
    if (confirmed >= frame.version) return frame;
    const known = [...history.current.keys()].filter(v => v <= confirmed).sort((a, b) => b - a)[0];
    return known === undefined ? frame : history.current.get(known)!;
  }, [frame, confirmed]);
  const syncing = Boolean(frame && isSyncing(frame.version, confirmed, appliedAt.current.get(frame.version), now));
  const reload = lastOk === null ? now - started.current > reloadAfterMs : mode === "offline" && now - lastOk > reloadAfterMs;
  const waiting = awaiting !== null && confirmed !== null && confirmed < awaiting;

  const press = useCallback(async (action: ControlAction, extra: Omit<ControlPress, "id" | "action"> = {}) => {
    const id = crypto.randomUUID(); mine.current.add(id);
    setPending(action); setMessage("");
    try {
      const response = await fetch(`/api/control/${engagement}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, from: frame?.state.live_session_id ?? null, ...extra }) });
      const result = await response.json() as ControlResult;
      setMessage(resultMessage(result));
      if (result.status === "ok" && result.version) setAwaiting(result.version);
      if (result.status === "moved") refreshShow.current();
      return result;
    } catch { const result = { status: "unavailable" }; setMessage(resultMessage(result)); return result; }
    finally { setPending(null); }
  }, [engagement, frame?.state.live_session_id]);

  const sessions = show.sessions;
  const shownId = frame?.state.live_session_id ?? null;
  const anchor = shownId ?? [...sessions].filter(s => s.shown_at).sort((a, b) => Date.parse(b.shown_at!) - Date.parse(a.shown_at!))[0]?.id ?? null;
  const steps = neighbours(sessions, shownId, anchor);
  const next = upNext(sessions, shownId, anchor);
  const current = sessions.find(s => s.id === shownId) ?? null;
  const refresh = useCallback(() => { refreshStatus.current(); refreshShow.current(); }, []);
  return { frame, mirror, mode, status, show, now, toasts, pending, waiting, message, syncing, reload, confirmed, press, steps, upNext: next, current, clockOffset: clock.current.offsetMs, setMessage, refresh };
}

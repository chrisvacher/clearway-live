"use client";
import { useEffect, useState } from "react";
import type { LiveAnswer, LiveResults, LiveSession, LiveSnapshot } from "@/lib/live/types";

type PreviewEntry = { status: "ok"; server_time: string; session: LiveSession; hidden_keys: string[]; hidden_ids: string[]; results: LiveResults; answers: LiveAnswer[] };

// One step as the TV would draw it, built on the room's own frame so it carries the TV's display (brand, theme,
// room size). Nothing is live in it: no burst, no spotlight, no question asked of the room, no live mark.
export function previewFrame(base: LiveSnapshot, entry: PreviewEntry): LiveSnapshot {
  return {
    ...base, answer: null, qa: null, promoted_quote: null, next: null, phone_depth: null,
    state: { ...base.state, live_session_id: entry.session.id, tv_content: "session", phones_down: false, burst_ends_at: null,
      spotlight_key: null, spotlight_id: null, neutral_question: undefined, hidden_keys: entry.hidden_keys, hidden_ids: entry.hidden_ids, show_tv_on_phones: false, results: entry.results },
    session: { ...entry.session, state: entry.session.state === "closed" ? "closed" : "open" },
    answers: entry.answers,
  };
}

// The preview screen's picture. A step on the TV now is the TV's own confirmed picture; any other step is read from
// the server when it is chosen, and read again when the room moves (late answers can still reach a step in its segment).
export function usePreview(engagement: string, session: string | null, room: { mirror: LiveSnapshot | null; version: number | undefined }) {
  const [entry, setEntry] = useState<{ id: string; data: PreviewEntry } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const live = Boolean(session && room.mirror?.state.tv_content === "session" && room.mirror.state.live_session_id === session);
  useEffect(() => {
    if (!session || live) return;
    let stopped = false;
    const t = setTimeout(async () => {
      try {
        const response = await fetch(`/api/control/${engagement}/preview?session=${session}`, { cache: "no-store" });
        const data = await response.json() as PreviewEntry | { status: string };
        if (stopped) return;
        if (response.ok && data.status === "ok") { setEntry({ id: session, data: data as PreviewEntry }); setFailed(null); } else setFailed(session);
      } catch { if (!stopped) setFailed(session); }
    }, entry?.id === session ? 400 : 0);
    return () => { stopped = true; clearTimeout(t); };
    // entry is read only to choose the delay; refetching on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engagement, session, live, room.version]);
  if (!session) return { frame: null, loading: false, failed: false };
  if (live) return { frame: room.mirror, loading: false, failed: false };
  const frame = entry?.id === session && room.mirror ? previewFrame(room.mirror, entry.data) : null;
  return { frame, loading: !frame && failed !== session, failed: failed === session && !frame };
}

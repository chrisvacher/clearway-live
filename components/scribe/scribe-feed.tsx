"use client";
import { useCallback, useEffect, useState } from "react";
import { ScribeCard } from "./scribe-card";
import { useArrivals } from "./use-arrivals";
import { shownCards, shownFiles } from "@/lib/scribe/policy";
import type { ScribeState } from "@/lib/scribe/types";
import "./scribe.css";

// The scribe feed on the control surface (FAC-01): the newest cards for the live step, in the
// facilitator's private column. The notice from the database says only that something changed; the
// cards are read here, under the facilitator's own sign-in. A card shows no speaker.
export function ScribeFeed({ engagement, tick }: { engagement: string; tick: number }) {
  const [state, setState] = useState<ScribeState | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/scribe/${engagement}?surface=control`, { cache: "no-store" });
      const data = await response.json() as ScribeState;
      if (data.status === "ok") setState(data);
    } catch { /* Keep the last feed. */ }
  }, [engagement]);
  useEffect(() => { void load(); }, [load, tick]);
  useEffect(() => { const t = setInterval(() => void load(), 15000); return () => clearInterval(t); }, [load]);
  const live = state?.live ?? null;
  const now = new Date().toISOString();
  const cards = shownCards(state, [], true, now).filter(c => !live || c.session_id === live.id);
  const files = shownFiles(state, [], true, now).filter(f => !live || f.session_id === live.id);
  const fresh = useArrivals([...cards.map(c => c.id), ...files.map(f => f.id)]);
  const title = (id: string) => state?.sessions.find(s => s.id === id)?.title;
  const shown = [...cards.map(c => ({ at: c.captured_at, node: <ScribeCard key={c.id} card={c} engagement={engagement} surface="feed" sessionTitle={title(c.session_id)} isNew={fresh.has(c.id)} /> })),
    ...files.map(f => ({ at: f.captured_at, node: <ScribeCard key={f.id} file={f} engagement={engagement} surface="feed" sessionTitle={title(f.session_id)} isNew={fresh.has(f.id)} /> }))]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  if (!state) return <p className="scr-muted">Reading the scribe’s cards.</p>;
  if (shown.length === 0) return <p className="scr-muted" data-testid="scribe-feed-empty">{live ? "No cards from the scribe yet for this step." : "Nothing is live."}</p>;
  return <div className="scr-feed" data-testid="scribe-feed">{shown.slice(0, 6).map(s => s.node)}{shown.length > 6 ? <span className="scr-feed-more">{shown.length - 6} more in the scribe console</span> : null}</div>;
}

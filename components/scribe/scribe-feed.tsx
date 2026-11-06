"use client";
import { useCallback, useEffect, useState } from "react";
import { ScribeCard } from "./scribe-card";
import { useArrivals } from "./use-arrivals";
import { shownCards, shownFiles } from "@/lib/scribe/policy";
import { promoteBlock, quoteMessages } from "@/lib/quote/promoted";
import type { ScribeState } from "@/lib/scribe/types";
import "./scribe.css";

// The scribe feed on the control surface (FAC-01): the newest cards for the live step, in the
// facilitator's private column. The notice from the database says only that something changed; the
// cards are read here, under the facilitator's own sign-in. A card shows no speaker.
export function ScribeFeed({ engagement, tick, live: room = null, promoted = null }: { engagement: string; tick: number; live?: string | null; promoted?: string | null }) {
  const [state, setState] = useState<ScribeState | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/scribe/${engagement}?surface=control`, { cache: "no-store" });
      const data = await response.json() as ScribeState;
      if (data.status === "ok") setState(data);
    } catch { /* Keep the last feed. */ }
  }, [engagement]);
  // Read again when the step on the TV changes or a quote goes up or comes down, so Promote always knows what is live.
  useEffect(() => { void load(); }, [load, tick, room, promoted]);
  useEffect(() => { const t = setInterval(() => void load(), 15000); return () => clearInterval(t); }, [load]);
  const [busy, setBusy] = useState(false), [error, setError] = useState<{ card: string; text: string } | null>(null);
  // Promote and take down are the facilitator's presses; the TV changes in the same room version for every screen.
  const press = useCallback(async (card: string | null) => {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/control/${engagement}/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(card ? { action: "promote", card } : { action: "take_down" }) });
      const data = await response.json().catch(() => ({})) as { status?: string };
      if (!response.ok || !["ok", "unchanged"].includes(data.status ?? "")) setError({ card: card ?? "", text: quoteMessages[data.status ?? ""] ?? "That didn’t go through. Try again." });
    } catch { setError({ card: card ?? "", text: "That didn’t go through. Try again." }); }
    setBusy(false); void load();
  }, [engagement, load]);
  const live = state?.live ?? null;
  const now = new Date().toISOString();
  const cards = shownCards(state, [], true, now).filter(c => !live || c.session_id === live.id);
  const files = shownFiles(state, [], true, now).filter(f => !live || f.session_id === live.id);
  const fresh = useArrivals([...cards.map(c => c.id), ...files.map(f => f.id)]);
  const title = (id: string) => state?.sessions.find(s => s.id === id)?.title;
  const shown = [...cards.map(c => ({ id: c.id, at: c.captured_at, node: <ScribeCard key={c.id} card={c} engagement={engagement} surface="feed" sessionTitle={title(c.session_id)} isNew={fresh.has(c.id)}
    promote={c.kind === "quote" ? { on: state?.promoted === c.id, block: promoteBlock(live, c), busy, error: error && (error.card === c.id || state?.promoted === c.id && !error.card) ? error.text : "", onPromote: () => void press(c.id), onTakeDown: () => void press(null) } : undefined} /> })),
    ...files.map(f => ({ id: f.id, at: f.captured_at, node: <ScribeCard key={f.id} file={f} engagement={engagement} surface="feed" sessionTitle={title(f.session_id)} isNew={fresh.has(f.id)} /> }))]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  // The quote on the TV stays in the feed, however many newer cards arrive, so it can always be taken down.
  const pinned = shown.find(s => s.id === state?.promoted), top = [...shown.slice(0, 6), ...pinned && !shown.slice(0, 6).includes(pinned) ? [pinned] : []];
  if (!state) return <p className="scr-muted">Reading the scribe’s cards.</p>;
  if (shown.length === 0) return <p className="scr-muted" data-testid="scribe-feed-empty">{live ? "No cards from the scribe yet for this step." : "Nothing is live."}</p>;
  return <div className="scr-feed" data-testid="scribe-feed">{top.map(s => s.node)}{shown.length > top.length ? <span className="scr-feed-more">{shown.length - top.length} more in the scribe console</span> : null}</div>;
}

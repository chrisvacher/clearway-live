"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { EyeOff, Plus, Split, X } from "lucide-react";
import { pressId } from "@/lib/control/own-presses";
import "./bars.css";
import type { ControlPanelProps } from "@/components/interactions/control-panels";

// The control surface's private panels for the bar family.
type Group = { ids: string[]; text: string; texts: string[]; count: number; existing: { key: string; text: string } | null };
type Suggestions = { status: string; session: string | null; suggest?: boolean; options?: number; groups: Group[] };
const Private = ({ title, children }: { title: string; children: React.ReactNode }) =>
  <section className="ctl-private bars-panel" aria-label={`${title}, only you see this`}><div className="show-private"><EyeOff size={16} aria-hidden="true" />Only you see this<span>{title}</span></div><div className="ctl-private-body">{children}</div></section>;

// INT-06 Add an option: suggestions from phones, matched by their words and shown as one.
// One tap adds the group's wording (editable) to every phone and the TV, merging duplicates.
export function RankingPanel({ room }: ControlPanelProps) {
  const engagement = room.show.context.id, session = room.frame?.session, live = session?.interaction === "ranking";
  const [data, setData] = useState<Suggestions | null>(null), [edits, setEdits] = useState<Record<string, string>>({}), [busy, setBusy] = useState<string | null>(null), [message, setMessage] = useState("");
  const running = useRef(false), again = useRef(false);
  const load = useCallback(async () => {
    if (running.current) { again.current = true; return; } running.current = true;
    try { const r = await fetch(`/api/control/${engagement}/ranking`, { cache: "no-store" }); if (r.ok) setData(await r.json() as Suggestions); }
    catch { /* Keep the last list; the next poll tries again. */ }
    finally { running.current = false; if (again.current) { again.current = false; void load(); } }
  }, [engagement]);
  // A phone's suggestion sends a private notice, which refreshes the room's status; follow it.
  useEffect(() => { if (live) void load(); }, [live, load, room.status, room.frame?.version]);
  useEffect(() => { if (!live) return; const t = setInterval(() => void load(), 5000); return () => clearInterval(t); }, [live, load]);
  if (!live) return null;
  const options = (session?.options ?? {}) as { suggest?: boolean; items?: unknown[] };
  if (!options.suggest) return null;
  const groups = data?.session === session?.id ? data.groups : [], full = (options.items?.length ?? 0) >= 12;
  async function act(group: Group, action: "add_option" | "dismiss") {
    const key = group.ids[0]; setBusy(key); setMessage("");
    try {
      const r = await fetch(`/api/control/${engagement}/ranking`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pressId(), action, ids: group.ids, text: (edits[key] ?? group.text).trim() }) });
      const out = await r.json().catch(() => ({})) as { status?: string };
      if (out.status !== "ok" && out.status !== "duplicate") setMessage(out.status === "exists" ? "That option is already on the list." : out.status === "full" ? "A ranking holds twelve options at most." : "That didn’t go through. Try again.");
    } catch { setMessage("That didn’t go through. Try again."); }
    finally { setBusy(null); void load(); }
  }
  return <Private title="Suggested options">
    <p className="show-help">{groups.length ? `${groups.reduce((a, g) => a + g.count, 0)} suggestions. Matching ones are shown as one. Add it and it appears on every phone and on the TV.` : "Nothing suggested yet. Phones can suggest a missing option."}</p>
    {groups.length > 0 && <ul className="bars-suggestions">{groups.map(g => { const key = g.ids[0]; return <li key={key} className="bars-suggestion">
      <input aria-label="Option to add" maxLength={120} value={edits[key] ?? g.text} onChange={e => setEdits(x => ({ ...x, [key]: e.target.value }))} />
      <span className="bars-suggestion-actions">
        <button className="show-button is-primary" disabled={Boolean(busy) || full || Boolean(g.existing) || !(edits[key] ?? g.text).trim()} onClick={() => void act(g, "add_option")}><Plus size={16} aria-hidden="true" />Add to every phone</button>
        <button className="show-button" disabled={Boolean(busy)} onClick={() => void act(g, "dismiss")}><X size={16} aria-hidden="true" />Dismiss</button>
      </span>
      <span className="bars-suggestion-meta">{g.count > 1 ? `Suggested by ${g.count} people${g.texts.length > 1 ? `, as ${g.texts.map(t => `“${t}”`).join(" and ")}` : ""}. Merged.` : "Suggested by 1 person."}{g.existing ? ` Already an option: ${g.existing.text}.` : ""}</span>
    </li>; })}</ul>}
    {full && <p className="show-help">This ranking has twelve options, the most it can hold.</p>}
    {message && <p className="show-message is-error" role="alert">{message}</p>}
  </Private>;
}

// INT-17: statements that divide the room, on this view only, never on the TV.
type StatementItem = { key: string; text: string; divided?: boolean; disagree?: number; agree?: number };
export function StatementsPanel({ room }: ControlPanelProps) {
  const session = room.frame?.session;
  if (session?.interaction !== "statements" || (session.options as { flag_divided?: boolean } | undefined)?.flag_divided === false) return null;
  const items = (room.status?.items ?? []) as StatementItem[], divided = items.filter(i => i.divided);
  const label = (key: string) => ((session.options as { items?: { key: string; text: string }[] }).items ?? []).find(s => s.key === key)?.text ?? key;
  return <Private title="Divided statements">
    {divided.length ? <ul className="bars-divided">{divided.map(i => <li key={i.key}><Split size={16} aria-hidden="true" /><span><strong>{label(i.key)}</strong> {i.disagree} disagree, {i.agree} agree. Ask someone from each end what they see.</span></li>)}</ul>
      : <p className="show-help">None yet. A statement is divided when at least 35% disagree and at least 35% agree, once four people have rated it.</p>}
  </Private>;
}

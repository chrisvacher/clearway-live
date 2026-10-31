"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { EyeOff, Monitor, MonitorCheck } from "lucide-react";
import { pairingCode } from "@/lib/tv/policy";
import type { TvManagerData } from "@/lib/tv/types";
export function TvManager({ id, initial }: { id: string; initial: TvManagerData }) {
  const [data, setData] = useState(initial), [display, setDisplay] = useState(initial.display);
  const [code, setCode] = useState(""), [label, setLabel] = useState("Front TV"), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState(false);
  const field = useRef<HTMLInputElement>(null), endpoint = `/api/tv/control/${id}`;
  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    async function poll() { try { const response = await fetch(endpoint, { cache: "no-store" }); if (response.ok && !stopped) setData(await response.json()); } catch { /* Keep the last screen list. */ } finally { if (!stopped) timer = setTimeout(() => void poll(), 5000); } }
    timer = setTimeout(() => void poll(), 5000); return () => { stopped = true; clearTimeout(timer); };
  }, [endpoint]);
  async function change(action: string, values: Record<string, unknown>) {
    setBusy(true); setMessage(""); setError(false);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...values }) });
      const result = await response.json();
      if (!response.ok || result.status !== "ok") {
        setError(true); setMessage(result.status === "invalid_code" ? "That code couldn’t be used. Check the code on the TV and try again." : result.status === "limited" ? "Please wait a few minutes before trying another code." : result.status === "running" ? "A session is live. Use the room controls to change what’s showing." : result.status === "closed" ? "This engagement has closed." : "We couldn’t save that. Please try again."); return;
      }
      setMessage(action === "pair" ? "TV paired. The screen will join automatically." : action === "unpair" ? "TV unpaired." : "TV settings saved.");
      if (action === "pair") { setCode(""); field.current?.focus(); }
      const current = await fetch(endpoint, { cache: "no-store" }); if (current.ok) setData(await current.json());
    } catch { setError(true); setMessage("We couldn’t reach the room. Please try again."); } finally { setBusy(false); }
  }
  const seen = (at: string) => {
    const minutes = Math.max(0, Math.floor((Date.parse(data.server_time) - Date.parse(at)) / 60000));
    return minutes < 1 ? "Last seen just now" : `Last seen ${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  };
  const pair = (event: FormEvent) => { event.preventDefault(); void change("pair", { code: pairingCode(code), label }); };
  return <>
    <div className="show-private"><EyeOff size={16} aria-hidden="true" />Only you see this</div>
    <header className="tv-manager-heading"><p className="show-eyebrow">{data.display.church} · {data.display.title}</p><h1>Pair a TV</h1><p>On the computer at the screen, open <a href="/tv" target="_blank" rel="noreferrer">live.clearway.co/tv</a>. Enter the code shown there.</p></header>
    {message && <p className={`show-message${error ? " is-error" : ""}`} role={error ? "alert" : "status"}>{message}</p>}
    <div className="tv-manager-columns"><form onSubmit={pair} className="tv-manager-card show-fields">
      <h2 className="is-full">Connect a screen</h2>
      <label className="is-full" htmlFor="tv-pair-code">Code on the TV<input ref={field} id="tv-pair-code" className="tv-manager-code" inputMode="numeric" autoComplete="off" maxLength={7} value={code} onChange={e => setCode(e.target.value.replace(/[^0-9 ]/g, ""))} required /></label>
      <label className="is-full" htmlFor="tv-label">Name this screen<input id="tv-label" maxLength={80} value={label} onChange={e => setLabel(e.target.value)} required /></label>
      <p className="show-help is-full">You can pair more than one screen. Pairing lasts until this engagement closes.</p>
      <button className="show-button tv-confirm is-full" disabled={busy || data.closed || !pairingCode(code) || !label.trim()}><MonitorCheck size={20} aria-hidden="true" />{busy ? "Pairing..." : "Pair this TV"}</button>
    </form>
    <section className="tv-manager-card"><h2>Paired screens</h2>{data.screens.length ? <ul className="tv-screen-list">{data.screens.map(screen => <li key={screen.id}><Monitor size={24} aria-hidden="true" /><div><strong>{screen.label}</strong><p>{screen.browser}</p><p className="show-help">{screen.last_seen_at ? seen(screen.last_seen_at) : "Waiting for the screen to join"}</p></div><button className="show-button" disabled={busy || data.closed} onClick={() => { if (window.confirm(`Unpair ${screen.label}? It will show a new code.`)) void change("unpair", { device: screen.id }); }}>Unpair</button></li>)}</ul> : <p>No screens paired yet.</p>}</section></div>
    <section className="tv-manager-card"><h2>Prepare the screen</h2><p>These views appear on every paired TV.</p><div className="show-actions">{[["join", "Show join screen"], ["screen_check", "Show screen check"], ["holding", "Show holding screen"]].map(([content, title]) => <button key={content} className="show-button" aria-pressed={data.tv_content === content} disabled={busy || data.closed} onClick={() => void change("screen", { content })}>{title}</button>)}</div></section>
    <form className="tv-manager-card show-fields" onSubmit={event => { event.preventDefault(); void change("display", { room_size: display.room_size, theme: display.theme, texture: display.texture, reduced_motion: display.reduced_motion }); }}>
      <h2 className="is-full">Display settings</h2><label htmlFor="tv-room-size">Screen size for the room<select id="tv-room-size" value={display.room_size} onChange={e => setDisplay(v => ({ ...v, room_size: e.target.value as typeof v.room_size }))}>{[["very_small", "Very small screen, largest type"], ["small", "Small screen"], ["medium", "Medium screen"], ["large", "Large screen"], ["very_large", "Very large screen"]].map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
      <label htmlFor="tv-theme">TV theme<select id="tv-theme" value={display.theme} onChange={e => setDisplay(v => ({ ...v, theme: e.target.value as typeof v.theme }))}><option value="dark">Navy</option><option value="light">Off-White</option></select></label>
      <label className="show-check" htmlFor="tv-texture"><input id="tv-texture" type="checkbox" checked={display.texture} onChange={e => setDisplay(v => ({ ...v, texture: e.target.checked }))} />Show the Clearway texture</label>
      <label className="show-check" htmlFor="tv-motion"><input id="tv-motion" type="checkbox" checked={display.reduced_motion} onChange={e => setDisplay(v => ({ ...v, reduced_motion: e.target.checked }))} />Reduce motion on the TV</label>
      <button className="show-button is-primary is-full" disabled={busy || data.closed}>Save display settings</button>
    </form>
  </>;
}

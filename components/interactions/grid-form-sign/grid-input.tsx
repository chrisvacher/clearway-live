"use client";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Check, Info, WifiOff } from "lucide-react";
import type { PhoneInputProps } from "@/components/interactions/phone-inputs";
import { clamp01, gridAnswer, gridColor, gridOf, nextOpen, placesOf, type Places } from "@/lib/interactions/grid-form-sign";
import "./grid-form-sign.css";

// INT-08 on the phone (pass 3 change 12): the numbered items and the grid on one screen.
// Tap a number, then tap or drag on the grid; drag a placed dot to move it; placing moves
// on to the next number. Each placement sends as it is made: the person's whole set rides
// in one answer, sent again as a change on every placement. Keyboard: arrows move the
// selected dot, Enter places it in the middle.
// A pin sits where it was placed, inside the plot's 8% margin.
function pinAt(el: HTMLElement | null, p: [number, number] | undefined) {
  if (!el || !p) return;
  el.style.left = `${8 + p[0] * 84}%`; el.style.top = `${8 + (1 - p[1]) * 84}%`;
}
// One input per step: moving to another grid starts fresh.
export function GridInput(props: PhoneInputProps) { return <GridStep key={props.step.id} {...props} />; }
function GridStep({ step, mine, open, send, change }: PhoneInputProps) {
  const grid = gridOf(step.options), items = grid.items;
  const own = mine[0] ?? null;
  const [places, setPlaces] = useState<Places>(() => placesOf(own?.value));
  const [selected, setSelected] = useState<string | null>(() => { const p = placesOf(own?.value); return items.find(i => !p[i.key])?.key ?? items[0]?.key ?? null; });
  const plot = useRef<HTMLDivElement>(null), dragging = useRef<{ key: string; fresh: boolean } | null>(null);
  // What the server holds wins, except while a finger is down. An answer the outbox has
  // just settled carries no value until the phone's room reloads: keep what is shown.
  const serverPlaces = own?.value !== undefined && own?.value !== null ? JSON.stringify(placesOf(own.value)) : null;
  useEffect(() => { if (serverPlaces !== null && !dragging.current) setPlaces(JSON.parse(serverPlaces)); }, [serverPlaces]);
  const label = (key: string | null) => items.find(i => i.key === key);
  const numOf = (key: string) => items.findIndex(i => i.key === key) + 1;
  const commit = (next: Places) => {
    const answer = gridAnswer(next, items);
    if (!Object.keys(answer.value.places).length) return;
    if (own) change(own.id, answer); else send(answer);
  };
  const at = (e: PointerEvent): [number, number] => {
    const r = plot.current!.getBoundingClientRect();
    return [clamp01(((e.clientX - r.left) / r.width - 0.08) / 0.84), clamp01(1 - ((e.clientY - r.top) / r.height - 0.08) / 0.84)];
  };
  function down(e: PointerEvent<HTMLDivElement>) {
    if (!open) return;
    const pin = (e.target as HTMLElement).closest<HTMLElement>("[data-key]");
    const key = pin?.dataset.key ?? selected;
    if (!key) return;
    e.preventDefault();
    plot.current!.setPointerCapture(e.pointerId);
    dragging.current = { key, fresh: !places[key] };
    setSelected(key); setPlaces(p => ({ ...p, [key]: at(e) }));
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const drag = dragging.current; if (!drag) return;
    setPlaces(p => ({ ...p, [drag.key]: at(e) }));
  }
  function up(e: PointerEvent<HTMLDivElement>) {
    const drag = dragging.current; if (!drag) return;
    dragging.current = null;
    const next = { ...places, [drag.key]: at(e) };
    setPlaces(next); commit(next);
    if (drag.fresh) setSelected(nextOpen(items, next, drag.key));
  }
  function key(e: KeyboardEvent<HTMLDivElement>) {
    if (!open || !selected) return;
    const d = ({ ArrowLeft: [-0.05, 0], ArrowRight: [0.05, 0], ArrowUp: [0, 0.05], ArrowDown: [0, -0.05] } as Record<string, [number, number]>)[e.key];
    if (e.key === "Enter" && !places[selected]) {
      e.preventDefault();
      const next = { ...places, [selected]: [0.5, 0.5] as [number, number] }; setPlaces(next); commit(next); setSelected(nextOpen(items, next, selected));
    } else if (d && places[selected]) {
      e.preventDefault();
      const p = places[selected], next = { ...places, [selected]: [clamp01(p[0] + d[0]), clamp01(p[1] + d[1])] as [number, number] };
      setPlaces(next); commit(next);
    }
  }
  const chosen = label(selected), placed = items.filter(i => places[i.key]).length;
  if (!items.length) return <p className="ph-text">The facilitator hasn’t added the items yet.</p>;
  return <div className="gfs-ph-grid">
    <div className="gfs-tray" role="listbox" aria-label="Items">{items.map((item, i) => <button key={item.key} type="button" role="option" aria-selected={item.key === selected}
      className={`gfs-chip ${gridColor(i + 1)}${item.key === selected ? " is-on" : ""}${places[item.key] ? " is-placed" : ""}`} disabled={!open}
      aria-label={`${i + 1}. ${item.text}${places[item.key] ? ", placed" : ""}`} onClick={() => setSelected(item.key)}>{i + 1}{places[item.key] && <span className="ck" aria-hidden="true"><Check size={10} strokeWidth={3} /></span>}</button>)}</div>
    <p className="gfs-gname" aria-live="polite">{chosen && <><b>{numOf(chosen.key)}.</b><span>{chosen.text}{open && !places[chosen.key] ? ". Tap the grid to place it." : ""}</span></>}</p>
    <div ref={plot} className={`gfs-phplot${open ? "" : " is-locked"}`} tabIndex={open ? 0 : -1} role="application" aria-label={`Grid, ${grid.y_label} by ${grid.x_label}. Arrow keys move the selected dot, Enter places it.`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}>
      <span className="ax is-x-low">{grid.x_low}</span><span className="ax is-x-high">{grid.x_high} {grid.x_label.toLowerCase()}</span><span className="ax is-y-high">{grid.y_high} {grid.y_label.toLowerCase()}</span>
      {items.map((item, i) => places[item.key] && <span key={item.key} data-key={item.key} className={`gfs-pin ${gridColor(i + 1)}${item.key === selected ? " is-on" : ""}${dragging.current?.key === item.key ? " is-dragging" : ""}`}
        ref={el => pinAt(el, places[item.key])} aria-label={`${i + 1}. ${item.text}`}>{i + 1}</span>)}
    </div>
    <p className="gfs-status"><span>{placed} of {items.length} placed</span>{open && placed > 0 && <span>Drag a dot to move it</span>}</p>
    <p className="ph-note">{own?.status === "saved" ? <><WifiOff size={14} aria-hidden="true" />Saved on this phone. Your placements send when you’re back online.</> : <><Info size={14} aria-hidden="true" />Each placement shows on the screen as you make it.</>}</p>
  </div>;
}

"use client";
import { useRef, useState, type PointerEvent } from "react";
import { Check, Info, PenLine, WifiOff } from "lucide-react";
import type { PhoneInputProps } from "@/components/interactions/phone-inputs";
import { Blocks } from "@/components/room/phone-content";
import { depthBlocks } from "@/lib/interactions/kinds";
import { addPoint, inkLength, maxInk, signaturePath, signText, sigHeight, sigWidth, strokesOf } from "@/lib/interactions/grid-form-sign";
import "./grid-form-sign.css";

// INT-10 on the phone (pass 3 change 13): the full text to read, its "## Title" sections
// expandable, then a signature field: sign with a finger on the line, the person's name
// printed under it. Sign stays held until there is ink; Clear wipes the field. The name on
// the screen is read on the server from who is signed in.
export function SignInput(props: PhoneInputProps) { return <SignStep key={props.step.id} {...props} />; }
function SignStep({ step, mine, open, send, change, name }: PhoneInputProps) {
  // A just-settled answer carries no value until the room reloads: show what was signed.
  const sent = useRef<string[]>([]);
  const own = mine[0] ?? null, held = own ? strokesOf(own.value) : [], signed = held.length ? held : sent.current;
  const signedName = own && typeof (own.value as { name?: unknown })?.name === "string" ? (own.value as { name: string }).name : null;
  const [strokes, setStrokes] = useState<string[]>([]);
  const [again, setAgain] = useState(false);
  const pad = useRef<SVGSVGElement>(null), drawing = useRef<number | null>(null);
  const text = signText(step.options), full = inkLength(strokes) >= maxInk;
  const point = (e: PointerEvent) => {
    const r = pad.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * sigWidth, ((e.clientY - r.top) / r.height) * sigHeight] as const;
  };
  function down(e: PointerEvent<SVGSVGElement>) {
    if (!open || full) return;
    e.preventDefault(); pad.current!.setPointerCapture(e.pointerId);
    const [x, y] = point(e);
    setStrokes(s => { drawing.current = s.length; return [...s, addPoint(null, x, y)]; });
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    if (drawing.current === null) return;
    const [x, y] = point(e), at = drawing.current;
    setStrokes(s => {
      if (inkLength(s) >= maxInk) return s;
      const next = [...s]; next[at] = addPoint(next[at] ?? null, x, y); return next;
    });
  }
  const up = () => { drawing.current = null; };
  function sign() {
    if (!open || !strokes.length) return;
    const answer = { text: name || "Signed", value: { strokes } };
    if (own) change(own.id, answer); else send(answer);
    sent.current = strokes; setStrokes([]); setAgain(false);
  }
  const showPad = open && (!own || again);
  return <div className="gfs-ph-sign">
    {text && <div className="gfs-doc"><Blocks blocks={depthBlocks(text)} /></div>}
    {own && !showPad ? <div className="gfs-signed">
      <svg className="gfs-sig-shown" viewBox={`0 0 ${sigWidth} ${sigHeight}`} role="img" aria-label={`${signedName ?? name ?? "Your"} signature`}><path d={signaturePath(signed)} /></svg>
      <p className="gfs-sig-name">{signedName ?? name}</p>
      <p className="ph-note">{own.status === "saved" ? <><WifiOff size={14} aria-hidden="true" />Saved on this phone. Your signature appears when you’re back online.</>
        : <><Check size={14} aria-hidden="true" />{step.state === "closed" ? "Signing has closed. Your signature is kept." : "Signed. Your signature and name are on the screen."}</>}</p>
      {open && <button type="button" className="ph-secondary" onClick={() => setAgain(true)}>Sign again</button>}
    </div> : showPad ? <div className="gfs-sigfield">
      <div className="gfs-siglabel"><span>Your signature</span><button type="button" className="ph-secondary" disabled={!strokes.length} onClick={() => setStrokes([])}>Clear</button></div>
      <div className={`gfs-sigpad${strokes.length ? " has-ink" : ""}`}>
        <svg ref={pad} viewBox={`0 0 ${sigWidth} ${sigHeight}`} role="img" aria-label="Signature field. Sign with your finger." onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <path d={signaturePath(strokes)} /></svg>
        {!strokes.length && <em className="gfs-sig-hint">Sign here with your finger</em>}
        <span className="gfs-sig-line">{name}</span>
      </div>
      <p className="ph-note"><Info size={14} aria-hidden="true" />{full ? "That fills the field. Clear it to start again." : "Your signature and name appear on the screen."}</p>
      <div className="ph-actions">{own && <button type="button" className="ph-secondary" onClick={() => { setAgain(false); setStrokes([]); }}>Keep my signature</button>}
        <button type="button" className="ph-send" disabled={!strokes.length} onClick={sign}><PenLine size={18} aria-hidden="true" />Sign</button></div>
    </div> : step.state === "closed" ? <p className="ph-text">Signing has closed.</p> : null}
  </div>;
}

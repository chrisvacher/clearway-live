"use client";
import { useRef } from "react";
import { Camera, FileUp, Users, WifiOff } from "lucide-react";
import { ScribeCard } from "./scribe-card";
import { CaptureComposer } from "./capture-composer";
import { useArrivals } from "./use-arrivals";
import { fileAccept } from "@/lib/scribe/policy";
import type { useScribe } from "./use-scribe";
import "./scribe.css";

type Scribe = ReturnType<typeof useScribe>;

// SCR-02: the scribe's phone. The camera is the main thing: take the easel photo, it is fitted,
// saved on the phone, and sent when there is a connection. A short note card can also be captured.
export function EaselCapture({ engagement, church, scribe }: { engagement: string; church: string; scribe: Scribe }) {
  const { state, mode, files, cards, online, waiting, capture, addFiles, dismiss, fileError } = scribe;
  const camera = useRef<HTMLInputElement>(null), picker = useRef<HTMLInputElement>(null);
  const live = state?.live ?? null;
  const off = mode !== "ready";
  const recent = files.filter(f => live ? f.session_id === live.id : true).slice(0, 4);
  const notes = cards.filter(c => live ? c.session_id === live.id : true).slice(0, 3);
  const fresh = useArrivals([...files.map(f => f.id), ...cards.map(c => c.id)]);
  return <div className="scr-app scr-phone" data-testid="scribe-phone">
    <header className="scr-phone-head"><div className="scr-session"><span className="scr-eyebrow">{church} · Scribe</span><b>{live ? live.title : "Nothing is live"}</b></div></header>
    <div className="scr-phone-body">
      {waiting > 0 || !online ? <div className="scr-queue" role="status"><WifiOff className="scr-icon" aria-hidden="true" /><span>{online ? "Sending what is saved on this phone." : "No connection. Photos are saved on this phone."}</span><span className="n" aria-label={`${waiting} waiting`}>{waiting}</span></div> : null}
      {mode === "team_led" ? <div className="scr-banner is-warning" role="status"><Users className="scr-icon" aria-hidden="true" /><span>The team has the room. Capture is off until the run of show moves on.</span></div> : null}
      {mode === "nothing" ? <div className="scr-banner" role="status"><span>Nothing is live yet. Photos attach to the step that is live.</span></div> : null}
      <div className="scr-cam">
        <div className="scr-view" aria-hidden="true"><span className="frame" />{live ? "Frame the whole easel page" : "Waiting for a live step"}</div>
        <button type="button" className="scr-shutter" disabled={off} aria-label="Take an easel photo" onClick={() => camera.current?.click()}><Camera className="scr-icon" aria-hidden="true" /></button>
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden aria-label="Take an easel photo" onChange={e => { const list = [...(e.target.files ?? [])]; e.target.value = ""; if (list.length) void addFiles(list, true); }} />
        <input ref={picker} type="file" multiple hidden accept={fileAccept} aria-label="Choose files to upload" onChange={e => { const list = [...(e.target.files ?? [])]; e.target.value = ""; if (list.length) void addFiles(list); }} />
        <div className="scr-phrow"><button type="button" className="scr-btn" disabled={off} onClick={() => picker.current?.click()}><FileUp className="scr-icon" aria-hidden="true" />Upload a file</button></div>
        {fileError ? <span className="scr-err" role="alert">{fileError}</span> : null}
      </div>
      <div className="scr-phone-cards" data-testid="scribe-phone-files">{recent.map(f => <ScribeCard key={f.id} file={f} engagement={engagement} surface="phone" onDismiss={dismiss} isNew={fresh.has(f.id)} />)}</div>
      <CaptureComposer sessionTitle={live && !live.team_led ? live.title : null} off={off} onCapture={capture} onFiles={list => void addFiles(list)} />
      <div className="scr-phone-cards">{notes.map(c => <ScribeCard key={c.id} card={c} engagement={engagement} surface="phone" onDismiss={dismiss} isNew={fresh.has(c.id)} />)}</div>
    </div>
  </div>;
}

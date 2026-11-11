"use client";
import Link from "next/link";
import { useState } from "react";
import { Copy, Download, Monitor } from "lucide-react";

// Invite the room: the link, the room code and a QR code, each ready to copy or download.
export function InviteCard({ id, code, link, qr, invite, closed }: { id: string; code: string; link: string; qr: { size: number; path: string }; invite: string; closed: boolean }) {
  const [said, setSaid] = useState("");
  async function copy(text: string, done: string) {
    try { await navigator.clipboard.writeText(text); setSaid(done); }
    catch { setSaid("Copying isn’t available in this browser. Select the text and copy it."); }
  }
  function download() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${qr.size} ${qr.size}" width="1024" height="1024"><rect width="100%" height="100%" fill="white"/><path d="${qr.path}" fill="black"/></svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })), a = document.createElement("a");
    a.href = url; a.download = `clearway-live-${code}.svg`; a.click(); URL.revokeObjectURL(url); setSaid("QR code downloaded.");
  }
  return <section className="admin-panel invite-card" aria-labelledby="invite-title">
    <h2 id="invite-title">Invite the room</h2>
    <p>{closed ? "This engagement is closed. Reopen it before people join." : "Send this ahead, or show it on the day."}</p>
    <div className="invite-body">
      <svg className="invite-qr" viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label={`QR code for ${link}`}><path d={qr.path} /></svg>
      <dl className="invite-facts">
        <div><dt>Link</dt><dd><a className="text-link" href={`https://${link}`}>{link}</a></dd></div>
        <div><dt>Room code, typed at live.clearway.co</dt><dd className="invite-code">{code}</dd></div>
      </dl>
    </div>
    <div className="admin-actions">
      <button className="admin-button is-primary" type="button" onClick={() => void copy(`https://${link}`, "Link copied.")}><Copy size={16} aria-hidden="true" />Copy link</button>
      <button className="admin-button" type="button" onClick={() => void copy(invite, "Invite text copied.")}><Copy size={16} aria-hidden="true" />Copy invite text</button>
      <button className="admin-button" type="button" onClick={download}><Download size={16} aria-hidden="true" />Download QR code</button>
    </div>
    <p className="invite-said" role="status" aria-live="polite">{said}</p>
    <div className="invite-day"><span>On the day</span><Link className="admin-button" href={`/setup/${id}/tv`}><Monitor size={16} aria-hidden="true" />Show the join screen on the TV</Link></div>
  </section>;
}

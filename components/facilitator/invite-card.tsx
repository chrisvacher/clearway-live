"use client";

import { useState } from "react";
import { AppWindow, Download, QrCode, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { TvNoteLine, useOpenTv } from "@/components/control/open-tv-window";
import { CopyRoomLink } from "./engagement-actions";
import { linkQr } from "@/lib/tv/qr";

export function InviteCard({ code, link, href, host, qr, invite, closed }: {
  code: string; link: string; href: string; host: string; qr: { size: number; path: string }; invite: string; closed: boolean;
}) {
  const toast = useToast();
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(invite);
      toast("Invite text copied");
    } catch {
      toast("Copying isn't available in this browser.");
    }
  }
  function download() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${qr.size} ${qr.size}" width="1024" height="1024"><rect width="100%" height="100%" fill="white"/><path d="${qr.path}" fill="black"/></svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `clearway-live-${code}.svg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="admin-panel eng-invite" aria-labelledby="invite-title">
    <h2 id="invite-title">Invite the room</h2>
    {closed && <p>This engagement is closed. Reopen it before people join.</p>}
    <div className="eng-invite-body">
      <svg className="eng-invite-qr" viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label={`QR code for ${link}`}><path d={qr.path} /></svg>
      <dl>
        <div><dt>Link</dt><dd><a href={href}>{link}</a><CopyRoomLink href={href} label={link} /></dd></div>
        <div><dt>Room code, typed at {host}</dt><dd className="eng-code">{code.replace(/^(\w{4})(\w{4})$/, "$1 $2")}</dd></div>
      </dl>
    </div>
    <div className="admin-actions">
      <Button size="small" variant="primary" onClick={() => void copyInvite()}>Copy invite text</Button>
      <Button size="small" onClick={download}><Download aria-hidden="true" />QR code</Button>
    </div>
  </section>;
}

export function OnTheDay({ id, closed, remoteUrl }: { id: string; closed: boolean; remoteUrl: string }) {
  const { open, busy, note } = useOpenTv(id);
  const toast = useToast();
  const [changing, setChanging] = useState(false), [showRemote, setShowRemote] = useState(false);
  const remoteQr = showRemote ? linkQr(remoteUrl) : null;
  async function showJoin() {
    setChanging(true);
    try {
      const response = await fetch(`/api/tv/control/${id}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "screen", content: "join" }) });
      const result = await response.json() as { status?: string; message?: string };
      if (!response.ok || result.status !== "ok") throw new Error(result.message || "We couldn't show the join screen.");
      toast("Join screen shown on the TV");
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "We couldn't show the join screen.");
    } finally {
      setChanging(false);
    }
  }

  return <section className="admin-panel eng-on-day" aria-labelledby="eng-on-day-title">
    <h2 id="eng-on-day-title">On the day</h2>
    <Button disabled={closed || busy} onClick={() => void open()}><AppWindow aria-hidden="true" />Open the TV in a new window</Button>
    <Button disabled={closed || changing} onClick={() => void showJoin()}><QrCode aria-hidden="true" />Show the join screen on the TV</Button>
    <Button onClick={() => setShowRemote(true)} aria-haspopup="dialog"><Smartphone aria-hidden="true" />Open the remote on my phone</Button>
    {remoteQr && <Dialog open label="Open the remote on my phone" className="eng-template-dialog" onClose={() => setShowRemote(false)}>
      <h2>Open the remote on my phone</h2>
      <p>Scan the code or copy the link to open the facilitator remote.</p>
      <div className="eng-invite-body">
        <svg className="eng-invite-qr" viewBox={`0 0 ${remoteQr.size} ${remoteQr.size}`} role="img" aria-label="QR code for the remote"><path d={remoteQr.path} /></svg>
        <div className="eng-room-link"><a href={remoteUrl}>{remoteUrl}</a><CopyRoomLink href={remoteUrl} label={remoteUrl} /></div>
      </div>
      <div className="admin-actions"><Button data-initial-focus onClick={() => setShowRemote(false)}>Close</Button><Button href={`/remote/${id}`}>Open the remote on this device</Button></div>
    </Dialog>}
    <TvNoteLine note={note} />
  </section>;
}

"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Smartphone, X } from "lucide-react";
import { linkQr } from "@/lib/tv/qr";

// Open the remote: the link to put on a phone, as a code to scan and a link to copy, with who can use it.
// The remote signs in like any facilitator screen, so the link is on the address this window is signed in at.
export function RemoteLink({ engagement }: { engagement: string }) {
  const [open, setOpen] = useState(false), [origin, setOrigin] = useState(""), [copied, setCopied] = useState(false);
  const close = useRef<HTMLButtonElement>(null), opener = useRef<HTMLButtonElement>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); opener.current?.focus(); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  const path = `/remote/${engagement}`, link = `${origin}${path}`;
  const qr = useMemo(() => origin ? linkQr(link) : null, [origin, link]);
  return <>
    <button ref={opener} type="button" className="show-button" aria-haspopup="dialog" onClick={() => setOpen(true)} data-testid="open-remote"><Smartphone size={18} aria-hidden="true" />Open the remote</button>
    {open && <div className="ctl-dialog-scrim" onClick={() => setOpen(false)}>
      <div className="ctl-dialog" role="dialog" aria-modal="true" aria-labelledby="remote-title" onClick={e => e.stopPropagation()}>
        <div className="ctl-row is-between"><h2 id="remote-title">Open the remote on a phone</h2><button ref={close} type="button" className="show-button is-icon" aria-label="Close" onClick={() => { setOpen(false); opener.current?.focus(); }}><X size={20} aria-hidden="true" /></button></div>
        <p>Scan the code or copy the link. The remote runs the room from a phone, with the same buttons as this screen.</p>
        <div className="ctl-remote-share">
          {qr && <svg className="ctl-remote-qr" viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label={`QR code for ${link}`} shapeRendering="crispEdges" data-testid="remote-qr"><rect width={qr.size} height={qr.size} className="ctl-remote-qr-ground" /><path d={qr.path} className="ctl-remote-qr-ink" /></svg>}
          <div className="ctl-remote-side">
            <p className="ctl-remote-link" data-testid="remote-link">{link}</p>
            <div className="ctl-row">
              <button type="button" className="show-button" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); } }}>{copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}{copied ? "Link copied" : "Copy link"}</button>
              <a className="show-button" href={path} data-testid="remote-here"><ExternalLink size={18} aria-hidden="true" />Open it on this computer</a>
            </div>
          </div>
        </div>
        <p className="show-help">It asks for a Clearway Google account. That account has to be an admin, or the lead or co-facilitator assigned on Details.</p>
      </div>
    </div>}
  </>;
}

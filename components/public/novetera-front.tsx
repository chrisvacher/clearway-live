import Link from "next/link";
import { NoveteraLockup } from "@/components/brand/novetera-lockup";
import { phoneTheme, screensFor } from "@/lib/brand/screens";
import "./novetera-front.css";

// The front page at live.novetera.co (the canvas's PhoneFront): the Novetera lockup, one room code field and Join. Nothing else: no product
// page, no demo, no facilitator link. The box posts where the Clearway one does (/join), so joining works before any script loads.
export function NoveteraFront({ code, note }: { code?: string; note?: string }) {
  return <div className="nvj" data-surface="phone" data-skin="novetera" data-theme={phoneTheme.novetera}>
    <a className="skip-link button-link" href="#main">Skip to content</a>
    <header className="nvj-head"><Link href="/" className="nvj-brand" aria-label={screensFor("novetera").homeLabel}><NoveteraLockup size="app" label={null} /></Link></header>
    <main id="main" className="nvj-main">
      <h1 id="join-title" className="nvj-title">Join your team in the room.</h1>
      <form className="nvj-form" action="/join" method="get" aria-labelledby="join-title">
        <label htmlFor="room-code" className="nvj-label">Room code</label>
        <input id="room-code" name="code" className="nvj-input" defaultValue={code ?? ""} placeholder="A7C3E91F" autoComplete="off" autoCapitalize="characters"
          spellCheck={false} maxLength={40} enterKeyHint="go" aria-invalid={Boolean(note)} aria-describedby="join-help" />
        <button className="nvj-button" type="submit">Join</button>
        <p id="join-help" className={`nvj-help${note ? " is-note" : ""}`} role={note ? "status" : undefined}>{note ?? "Or point your phone’s camera at the QR code on the TV."}</p>
      </form>
    </main>
    <footer className="nvj-foot"><p className="nvj-tagline">New tools. Same mission.</p></footer>
  </div>;
}

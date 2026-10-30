"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

type Status = { status: string; device_code?: string; can_claim?: boolean; name?: string; role?: string };
const messages: Record<string, string> = {
  sent: "Check your email for a 6-digit code or a sign-in link.",
  invalid_code: "That code couldn’t be used. Check it or ask for a new one.",
  rate_limited: "Please wait a few minutes before trying again. Your facilitator can also sign you in.",
  not_listed: "Your email isn’t on the list yet. You can ask your facilitator to let you in.",
  check_facilitator: "Check with your facilitator to join this room.",
  pending: "Your facilitator will let you in shortly.",
  declined: "Check with your facilitator before trying again.",
  email_unavailable: "We couldn’t send your email. Please try again, or show your facilitator the device code below.",
  unavailable: "We couldn’t connect just now. Please try again.",
  closed: "This engagement has closed. Check with your facilitator.",
  invalid_request: "Check your details and try again.",
};

export function RoomAccess({ engagement, email: initialEmail = "", confirm }: { engagement: string; email?: string; confirm?: { challenge: string; token: string } }) {
  const [state, setState] = useState<Status>({ status: "loading" });
  const [email, setEmail] = useState(initialEmail);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [deviceCode, setDeviceCode] = useState("");
  const [busy, setBusy] = useState(false);
  const claiming = useRef(false);
  const post = useCallback(async (action: string, data: Record<string, unknown> = {}): Promise<Status> => {
    const response = await fetch(`/api/room/${engagement}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), cache: "no-store" });
    return response.json();
  }, [engagement]);
  useEffect(() => {
    let active = true;
    // Confirm links do not initialize or exchange anything on GET, even with JS.
    if (confirm) { setState({ status: "ready" }); return; }
    post("init").then(data => { if (active) { setState(data); setDeviceCode(data.device_code || ""); } }).catch(() => { if (active) setState({ status: "unavailable" }); });
    const interval = setInterval(async () => {
      if (claiming.current) return;
      try {
        const data: Status = await (await fetch(`/api/room/${engagement}/status`, { cache: "no-store" })).json();
        if (!active) return;
        if (data.status === "signed_in" || data.status === "closed" || data.status === "pending" || data.status === "declined") setState(data);
        if (data.can_claim) {
          claiming.current = true;
          try { const claimed = await post("claim"); if (active) setState(claimed); }
          finally { claiming.current = false; }
        }
      } catch { /* Keep the current screen while reconnecting. */ }
    }, 2500);
    return () => { active = false; clearInterval(interval); };
  }, [engagement, post, confirm]);
  async function submit(event: FormEvent, action: string) {
    event.preventDefault(); setBusy(true);
    try {
      if (action === "confirm") await post("init");
      const data = await post(action, action === "confirm" ? confirm : { email, code, name });
      setState(data);
      if (data.status === "signed_in" && confirm) location.replace(`/room/${engagement}`);
    } catch { setState({ status: "unavailable" }); }
    finally { setBusy(false); }
  }
  if (state.status === "signed_in") return <section aria-live="polite"><h2>{state.name ? `You’re in, ${state.name}.` : "You’re in."}</h2><p>{state.role === "scribe" ? "You’re joining as the scribe." : "Your place in the room is ready."}</p><p>Your facilitator will let you know what happens next.</p></section>;
  if (state.status === "closed") return <p role="status">{messages.closed}</p>;
  if (confirm) return <section><p>Tap below to finish signing in on this device.</p>
    <form onSubmit={event => submit(event, "confirm")}><button className="button-link" disabled={busy} type="submit">Confirm sign-in</button></form>
    {messages[state.status] && <p role="status">{messages[state.status]}</p>}
  </section>;
  return <section className="form-stack">
    <p role="status" aria-live="polite">{messages[state.status] || "Use the email address on your invite."}</p>
    <form className="form-stack" onSubmit={event => submit(event, "send")}>
      <label htmlFor="room-email">Your email</label><input id="room-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} />
      <button className="button-link" disabled={busy || state.status === "loading"} type="submit">Send me a sign-in code</button>
    </form>
    <form className="form-stack" onSubmit={event => submit(event, "verify")}>
      <label htmlFor="room-code">Your 6-digit code</label><input id="room-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} required />
      <button className="button-link" disabled={busy || code.length !== 6 || !email} type="submit">Sign in</button>
    </form>
    {["not_listed", "check_facilitator", "pending", "declined"].includes(state.status) && <form className="form-stack" onSubmit={event => submit(event, "join")}>
      <label htmlFor="room-name">Your name</label><input id="room-name" autoComplete="name" maxLength={200} value={name} onChange={e => setName(e.target.value)} required />
      <button className="button-link" type="submit" disabled={busy || state.status === "pending"}>Ask to join</button>
    </form>}
    {deviceCode && <aside className="notice"><h2>Need a hand signing in?</h2><p>Show this device code to your facilitator.</p><p className="device-code">{deviceCode.slice(0,4)} {deviceCode.slice(4)}</p></aside>}
  </section>;
}

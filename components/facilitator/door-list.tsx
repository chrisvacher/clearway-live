"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Request = { id: string; name: string; email: string };
type Attendee = { id: string; name: string; email: string };
export function DoorList({ engagement, requests, attendees }: { engagement: string; requests: Request[]; attendees: Attendee[] }) {
  const router = useRouter(); const [message, setMessage] = useState(""); const [busy,setBusy]=useState(false);
  async function act(action: string, data: Record<string,unknown>) {
    setBusy(true);
    try {
      const response=await fetch(`/api/facilitator/${engagement}/door`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...data})});
      const result=await response.json(); setMessage(result.ok ? (action === "decline" ? "Request declined." : "Saved. The phone will sign in automatically.") : "We couldn’t save that. Check the details and try again."); router.refresh();
    } catch { setMessage("We couldn’t connect just now. Please try again."); } finally {setBusy(false);}
  }
  function manual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();const data=new FormData(event.currentTarget);void act("manual",{attendee:data.get("attendee"),code:data.get("code")});
  }
  return <section className="form-stack"><h2>Waiting to join</h2>
    {requests.length ? <ul className="plain-list">{requests.map(request=><li className="notice" key={request.id}><h3>{request.name}</h3><p>{request.email}</p>
      <div className="actions"><button className="button-link" disabled={busy} onClick={()=>act("approve",{request:request.id})}>Let in</button><button className="button-link secondary" disabled={busy} onClick={()=>act("decline",{request:request.id})}>Decline request</button></div>
    </li>)}</ul> : <p>No one is waiting to join.</p>}
    <h2>Sign someone in by hand</h2><form className="form-stack" onSubmit={manual}>
      <label htmlFor="manual-attendee">Person on the attendee list</label><select id="manual-attendee" name="attendee" required><option value="">Choose a person</option>{attendees.map(a=><option key={a.id} value={a.id}>{a.name} ({a.email})</option>)}</select>
      <label htmlFor="manual-code">Device code on their phone</label><input id="manual-code" name="code" autoComplete="off" required maxLength={9} pattern="[A-HJ-NP-Za-hj-np-z2-9 ]{8,9}" />
      <button className="button-link" type="submit" disabled={busy}>Sign in this device</button>
    </form><p role="status" aria-live="polite">{message}</p>
  </section>;
}

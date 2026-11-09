"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Member } from "@/lib/setup/types";

export function UserAdmin({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]), [member, setMember] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function perform(action: "hub_members" | "add_clearway_user") {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, member }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "We couldn’t finish that. Please try again.");
      if (action === "hub_members") { setMembers(result.members); if (!result.members.length) setMessage("No Clearway team members were found."); }
      else { setMessage("Clearway user added. You can assign them to an engagement."); setMember(""); router.refresh(); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "We couldn’t connect. Please try again."); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void perform("add_clearway_user"); }
  return <section className="admin-panel"><h2>Add a Clearway user</h2><p>Choose a Team Hub team member with a Clearway email. This gives them facilitator access without making them an admin.</p>
    {!configured && <p>The Team Hub connection is unavailable. Please try again later.</p>}
    <form className="form-stack" onSubmit={submit}><button className="admin-button" type="button" disabled={busy || !configured} onClick={() => void perform("hub_members")}>{busy ? "Please wait…" : "Load Clearway team"}</button>
      <label>Team member<select value={member} disabled={busy || !members.length} onChange={e => setMember(e.target.value)} required><option value="">Choose a team member</option>{members.map(m => <option key={m.id} value={m.id}>{m.name} ({m.email})</option>)}</select></label>
      <button className="admin-button is-primary" type="submit" disabled={busy || !member}>Add Clearway user</button></form><p role="status" aria-live="polite">{message}</p>
  </section>;
}

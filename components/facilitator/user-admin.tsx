"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Member } from "@/lib/setup/types";
import { Select } from "@/components/ui/select";

// The team is fetched once when the page opens. Nothing is pressed to load it.
export function UserAdmin({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]), [member, setMember] = useState(""), [loading, setLoading] = useState(configured), [failed, setFailed] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const post = useCallback(async (body: Record<string, string>) => {
    const response = await fetch("/api/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || "We couldn’t finish that. Please try again.");
    return result;
  }, []);
  const load = useCallback(async () => {
    setLoading(true); setFailed("");
    try { setMembers((await post({ action: "hub_members" })).members); }
    catch (error) { setFailed(error instanceof Error ? error.message : "We couldn’t connect. Please try again."); }
    finally { setLoading(false); }
  }, [post]);
  useEffect(() => { if (configured) void load(); }, [configured, load]);
  async function add(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { await post({ action: "add_clearway_user", member }); setMessage("Clearway user added. You can assign them to an engagement."); setMember(""); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "We couldn’t connect. Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="admin-panel"><h2>Add a Clearway user</h2><p>Choose a Team Hub team member with a Clearway email. This gives them facilitator access without making them an admin.</p>
    {!configured ? <p>The Team Hub connection is unavailable. Please try again later.</p> : <>
      {failed && <p role="alert">{failed} <button className="admin-button is-small" type="button" disabled={loading} onClick={() => void load()}>Try again</button></p>}
      {!failed && !loading && !members.length && <p>No Clearway team members were found.</p>}
      <form className="form-stack" onSubmit={add}>
        <label>Team member<Select value={member} disabled={busy || loading || !members.length} onChange={e => setMember(e.target.value)} required><option value="">{loading ? "Loading the team…" : "Choose a team member"}</option>{members.map(m => <option key={m.id} value={m.id}>{m.name} ({m.email})</option>)}</Select></label>
        <button className="admin-button is-primary" type="submit" disabled={busy || !member}>Add Clearway user</button></form>
      <p className="admin-saved" role="status" aria-live="polite">{message}</p></>}
  </section>;
}

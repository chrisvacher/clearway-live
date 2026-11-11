"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { setupRequest } from "./setup-editor";

export type Joining = { id: string; type: string; roomCode: string; linkName: string | null; openJoin: boolean; neutral: boolean; how: string; closed: boolean };

// People and joining (design pass 8): where people go, who can get in, and the ways in. Each card saves on its own.
export function JoiningEditor({ initial, admin, church, title }: { initial: Joining; admin: boolean; church: string; title: string }) {
  const router = useRouter();
  const [j, setJ] = useState(initial), [named, setNamed] = useState(Boolean(initial.linkName)), [name, setName] = useState(initial.linkName ?? "");
  const [how, setHow] = useState(initial.how), [busy, setBusy] = useState(false), [said, setSaid] = useState<{ where: string; text: string; bad?: boolean } | null>(null), [renew, setRenew] = useState(false);
  const workshop = j.type === "team_workshop", shown = named && j.linkName ? j.linkName : j.roomCode, link = `live.clearway.co/${shown}`;
  async function save(where: string, body: Record<string, unknown>, done: string, apply: (result: { link_name?: string | null; room_code?: string }) => void) {
    setBusy(true); setSaid(null);
    try { const result = await setupRequest({ action: "joining_save", id: j.id, ...body }); apply(result); setSaid({ where, text: done }); router.refresh(); }
    catch (e) { setSaid({ where, text: e instanceof Error ? e.message : "We couldn’t save that. Please try again.", bad: true }); }
    finally { setBusy(false); }
  }
  const note = (where: string) => <p className={`admin-feedback${said?.where === where && said.bad ? " is-bad" : ""}`} role="status" aria-live="polite">{said?.where === where ? said.text : ""}</p>;
  const copy = async () => { try { await navigator.clipboard.writeText(`https://${link}`); setSaid({ where: "link", text: "Link copied." }); } catch { setSaid({ where: "link", text: "Copying isn’t available in this browser.", bad: true }); } };
  return <div className="joining admin-editor">
    <section className="admin-panel" aria-labelledby="join-link"><h2 id="join-link">The link</h2><p>Where people go on their phone or laptop. The room code below always works too.</p>
      <div className="create-kinds" role="radiogroup" aria-label="The link">
        <label className={`create-option${named ? " is-on" : ""}`}><input type="radio" name="link" checked={named} disabled={busy} onChange={() => setNamed(true)} /><span><strong>A name you choose</strong><span>Easy to say and remember. Good for workshops and open rooms.</span></span></label>
        <label className={`create-option${!named ? " is-on" : ""}`}><input type="radio" name="link" checked={!named} disabled={busy} onChange={() => setNamed(false)} /><span><strong>The room code</strong><span>Hard to guess. Good when only your list should get in.</span></span></label>
      </div>
      {named
        ? <div className="joining-line"><label htmlFor="link-name">live.clearway.co/</label><input id="link-name" value={name} maxLength={24} placeholder={church.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24)} disabled={busy} onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))} />
            <button className="admin-button is-primary" type="button" disabled={busy || name.length < 3 || name === j.linkName} onClick={() => void save("link", { link_name: name }, "Saved. The new link works now.", r => setJ(x => ({ ...x, linkName: r.link_name ?? null })))}>Save the name</button></div>
        : <div className="joining-line"><span>live.clearway.co/<strong className="invite-code">{j.roomCode}</strong></span>
            {j.linkName && <button className="admin-button" type="button" disabled={busy} onClick={() => void save("link", { link_name: "" }, "Saved. The name no longer opens this room.", () => { setJ(x => ({ ...x, linkName: null })); setName(""); })}>Stop using {j.linkName}</button>}</div>}
      <div className="admin-actions"><button className="admin-button" type="button" onClick={() => void copy()}><Copy size={16} aria-hidden="true" />Copy {link}</button></div>
      {note("link")}
    </section>

    <section className="admin-panel" aria-labelledby="join-who"><h2 id="join-who">Who can join</h2><p>Answers are anonymous on the screen either way.</p>
      <div className="create-kinds" role="radiogroup" aria-label="Who can join">
        <label className={`create-option${j.openJoin ? " is-on" : ""}`}><input type="radio" name="who" checked={j.openJoin} disabled={busy || !admin || !workshop} onChange={() => void save("who", { open_join: true }, "Saved. Anyone with the link or code can join by name.", () => setJ(x => ({ ...x, openJoin: true })))} /><span><strong>Anyone who has the link or code</strong><span>They type their name and they are in. No email, no list.{!workshop ? " For workshops only: Wayfinding uses the list so check-ins can reach each person." : !admin ? " Only an admin can change this." : ""}</span></span></label>
        <label className={`create-option${!j.openJoin ? " is-on" : ""}`}><input type="radio" name="who" checked={!j.openJoin} disabled={busy || !admin || !workshop} onChange={() => void save("who", { open_join: false }, "Saved. Only people on your list can join.", () => setJ(x => ({ ...x, openJoin: false })))} /><span><strong>Only people on your list</strong><span>They enter their email and get a sign-in code. Emails not on the list ask to join, and you approve them on the door list.</span></span></label>
      </div>
      {!j.openJoin && <label className="check-row"><input type="checkbox" checked={j.neutral} disabled={busy} onChange={e => { const on = e.target.checked; void save("who", { neutral_join_message: on }, "Saved.", () => setJ(x => ({ ...x, neutral: on }))); }} />Say “Check with your facilitator” to emails not on the list, without saying whether they are on it</label>}
      {note("who")}
    </section>

    <section className="admin-panel" aria-labelledby="join-ways"><h2 id="join-ways">Ways in</h2><p>All three lead to the same room, and all three are on.</p>
      <ul className="joining-ways">
        <li><Check size={16} aria-hidden="true" /><div><strong>The link</strong><span>Sent ahead by email or text: {link}</span></div></li>
        <li><Check size={16} aria-hidden="true" /><div><strong>A QR code</strong><span>On the TV’s join screen, and to download from the Overview.</span></div></li>
        <li><Check size={16} aria-hidden="true" /><div><strong>The room code, typed at live.clearway.co</strong><span>Shown on the TV: <strong className="invite-code">{j.roomCode}</strong></span></div></li>
      </ul>
      {renew
        ? <div className="admin-actions"><span>The old code, its link and any printed QR code stop working. A chosen name keeps working.</span><button className="admin-button is-primary" type="button" disabled={busy} onClick={async () => { setBusy(true); try { const r = await setupRequest({ action: "room_code_renew", id: j.id }); setJ(x => ({ ...x, roomCode: r.room_code })); setSaid({ where: "ways", text: "New code made." }); setRenew(false); router.refresh(); } catch (e) { setSaid({ where: "ways", text: e instanceof Error ? e.message : "Please try again.", bad: true }); } finally { setBusy(false); } }}>Make the new code</button><button className="admin-button" type="button" onClick={() => setRenew(false)}>Keep this code</button></div>
        : <div className="admin-actions"><button className="admin-button" type="button" disabled={busy || j.closed} onClick={() => setRenew(true)}>Make a new code</button></div>}
      {note("ways")}
    </section>

    <section className="admin-panel" aria-labelledby="join-how"><h2 id="join-how">How the room decides</h2><p>Shown on the join page and in invites for {title}.</p>
      <label htmlFor="how-decides" className="sr-only">How the room decides</label><textarea id="how-decides" value={how} rows={4} maxLength={4000} disabled={busy} onChange={e => setHow(e.target.value)} />
      <div className="admin-actions"><button className="admin-button is-primary" type="button" disabled={busy || !how.trim() || how === j.how} onClick={() => void save("how", { how_the_room_decides: how }, "Saved.", () => setJ(x => ({ ...x, how })))}>Save</button></div>
      {note("how")}
    </section>
  </div>;
}

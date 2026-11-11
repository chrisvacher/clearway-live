"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Check, CircleCheck, CircleDashed, CircleX, Download, Flag, HandHelping, Loader, Mail, MailX, Minus, Send, TrendingUp, TriangleAlert, UserRound } from "lucide-react";
import { answerLabel, dayInZone, followUps, goalAnswers, longDate, roundCounts, shortDate, type CheckInState, type ResultRound } from "@/lib/check-ins/policy";
import "./check-ins.css";

const icon = (answer: string | null) => {
  const props = { size: 14, "aria-hidden": true } as const;
  switch (answer) {
    case "done": return <Check {...props} />; case "under_way": return <Loader {...props} />; case "stuck": return <HandHelping {...props} />;
    case "not_started": return <CircleDashed {...props} />; case "on_track": return <TrendingUp {...props} />; case "at_risk": return <TriangleAlert {...props} />; case "off_track": return <CircleX {...props} />;
    default: return <Minus {...props} />;
  }
};
const Chip = ({ answer }: { answer: string | null }) => <span className={`cir-chip${answer === "done" ? " is-done" : answer === "under_way" || answer === "on_track" ? " is-info" : answer === "stuck" || answer === "at_risk" || answer === "off_track" ? " is-warn" : ""}`}>{icon(answer)}{answer ? answerLabel[answer] : "No answer"}</span>;

type Say = { text: string; tone?: "warn" } | null;

export function CheckInResults({ engagement, church, title, initial }: { engagement: string; church: string; title: string; initial: CheckInState }) {
  const [state, setState] = useState(initial);
  const [pick, setPick] = useState<number>(() => { const open = initial.rounds.filter(r => r.status === "sent"); return (open.at(-1) ?? initial.rounds[0])?.day ?? 30; });
  const [panel, setPanel] = useState<null | "send" | "off">(null);
  const [busy, setBusy] = useState(false);
  const [say, setSay] = useState<Say>(null);
  const [base, setBase] = useState("");
  const read = useCallback(async () => {
    try {
      const response = await fetch(`/api/control/${engagement}/check-ins`, { cache: "no-store" });
      if (!response.ok) return;
      const next = await response.json() as CheckInState;
      if (next.status === "ok") setState(next);
    } catch { /* Keep what is on the screen. */ }
  }, [engagement]);
  // Answers arrive as people send them. The page follows without being asked.
  useEffect(() => { const timer = setInterval(() => void read(), 6000); return () => clearInterval(timer); }, [read]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/control/${engagement}/check-ins`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const out = await response.json().catch(() => ({ status: "unavailable" })) as Record<string, unknown>;
      await read();
      return out;
    } finally { setBusy(false); }
  };

  const rounds = state.rounds;
  const round: ResultRound | undefined = rounds.find(r => r.day === pick) ?? rounds[0];
  const earlier = round ? [...rounds].filter(r => r.day < round.day && r.status === "sent").at(-1) : undefined;
  const counts = round ? roundCounts(round) : null;
  const follow = useMemo(() => round ? followUps(round) : [], [round]);
  const waiting = round?.recipients.filter(r => !r.answered_at) ?? [];
  const steps = round?.recipients.flatMap(r => r.steps.map(s => ({ ...s, who: r.name }))) ?? [];
  const goals = round?.recipients.flatMap(r => r.goals.map(g => ({ ...g, who: r.name }))) ?? [];
  const stepsDone = steps.filter(s => s.answer === "done").length;
  const offScript = follow.filter(f => !f.done).length;
  const moved = useMemo(() => {
    if (!round || !earlier) return [];
    const before = new Map<string, { text: string; answer: string | null }>();
    earlier.recipients.forEach(r => { r.steps.forEach(s => before.set(s.id, { text: s.text, answer: s.answer })); r.goals.forEach(g => before.set(g.id, { text: g.title, answer: g.answer })); });
    const now = [...round.recipients.flatMap(r => r.steps.map(s => ({ id: s.id, text: s.text, who: r.name, answer: s.answer }))), ...round.recipients.flatMap(r => r.goals.map(g => ({ id: g.id, text: g.title, who: r.name, answer: g.answer })))];
    return now.filter(n => n.answer && before.has(n.id)).map(n => ({ ...n, was: before.get(n.id)!.answer }));
  }, [round, earlier]);

  const send = async () => {
    if (!round) return;
    const out = await post({ action: "send", round: round.id });
    setPanel(null);
    if (out.status === "ok") setSay({ text: `Sent. ${Number(out.sent ?? 0)} emailed${Number(out.practice ?? 0) ? `, ${Number(out.practice)} practice ${Number(out.practice) === 1 ? "address" : "addresses"} not sent` : ""}${Number(out.failed ?? 0) ? `, ${Number(out.failed)} did not go through` : ""}.` });
    else setSay({ text: out.status === "sent" ? "That round has already gone out." : out.status === "off" ? "That round is switched off." : out.status === "superseded" ? "That round is skipped because a later check-in has gone out." : out.status === "busy" ? "That round is being sent. Check again in a minute." : "The check-in could not be sent. Nothing was lost, so try again.", tone: "warn" });
  };
  const create = async () => {
    const out = await post({ action: "create", base: base || null });
    if (out.status === "ok") setSay({ text: "Check-ins are set up." });
    else if (out.status === "needs_date") setSay({ text: "Choose the date the retreat ended first.", tone: "warn" });
    else setSay({ text: out.status === "exists" ? "Check-ins are already set up." : "Check-ins could not be set up.", tone: "warn" });
  };
  const mark = async (answer: string, done: boolean) => { await post({ action: "follow_up", answer, done }); };
  const openAs = async (recipient: string) => {
    const tab = window.open("about:blank", "_blank");
    const out = await post({ action: "open_as", recipient });
    if (out.status === "ok" && typeof out.link === "string" && tab) tab.location.href = out.link;
    else { tab?.close(); setSay({ text: "That page could not be opened.", tone: "warn" }); }
  };
  // Switch off only while something is scheduled and will go out. Switch on only when it would schedule something: a round skipped because a later one went out stays off.
  const off = rounds.some(r => r.status === "scheduled" && !r.superseded), canOn = !!state.can_switch_on;
  const sentNow = rounds.some(r => r.status === "sent");

  return <main id="main" className="tv-manager recap">
    <div className="ctl-row recap-actions">
      {rounds.length > 0 && <a className="show-button" href={`/api/control/${engagement}/check-ins?format=csv`} download><Download size={18} aria-hidden="true" />Download CSV</a>}</div>
    <div className="tv-manager-heading"><p className="ctl-eyebrow">{church} · {title}</p><h1>Check-ins</h1>
      <p className="show-help">At 30, 60 and 90 days after the retreat, each owner gets one email with a link to a short check-in on their own first steps and goals. You see what they say here.</p></div>
    <div className="cir">
      {say && <p className={`cir-banner${say.tone === "warn" ? " is-warn" : ""}`} role="status">{say.text}</p>}

      {!state.eligible && <div className="cir-banner"><span>This kind of engagement doesn&rsquo;t use check-ins.</span></div>}

      {state.eligible && rounds.length === 0 && <section className="cir-card"><div><p className="ctl-eyebrow">Not set up yet</p><h2>Create check-ins</h2></div>
        {state.retreat_closed_on
          ? <p>The retreat ended on {longDate(state.retreat_closed_on)}. The three check-ins will fall 30, 60 and 90 days after that.</p>
          : <><p>Check-ins are set up when the retreat closes. If that hasn&rsquo;t happened in the app, give the date the retreat ended and the three check-ins will fall 30, 60 and 90 days after it.</p>
            <label className="cir-field">Retreat end date<input type="date" value={base} onChange={e => setBase(e.target.value)} /></label></>}
        <div className="cir-actions"><button className="show-button is-primary" type="button" disabled={busy || (!state.retreat_closed_on && !base)} onClick={() => void create()}><Mail size={16} aria-hidden="true" />Create check-ins</button></div></section>}

      {round && <>
        <div className="cir-head">
          <div className="cir-tabs" role="tablist" aria-label="Check-in rounds">{rounds.map(r => <button key={r.id} type="button" role="tab" className="cir-tab" aria-selected={r.day === round.day} onClick={() => { setPick(r.day); setPanel(null); }}>{r.day} days</button>)}</div>
          <div className="cir-actions">
            {(off || canOn) && <button className="show-button" type="button" disabled={busy} onClick={() => off ? setPanel("off") : void post({ action: "switch", on: true }).then(() => setSay({ text: "Check-ins are switched on again." }))}>{off ? "Switch off check-ins" : "Switch check-ins on"}</button>}
          </div></div>

        <section className="cir-card" aria-label={`${round.day}-day round`}>
          <div className="cir-head"><div><p className="ctl-eyebrow">Round {rounds.findIndex(r => r.id === round.id) + 1} of {rounds.length}</p><h2>The {round.day}-day check-in</h2></div>
            <span className={`cir-chip${round.status === "sent" ? " is-done" : round.status === "off" || round.superseded ? "" : " is-info"}`}>{round.status === "sent" ? "Sent" : round.status === "sending" ? "Sending" : round.superseded ? "Skipped" : round.status === "off" ? "Switched off" : "Scheduled"}</span></div>
          <p className="cir-meta"><span>{round.superseded ? "Skipped because a later check-in has gone out. This one will not be sent." : round.status === "off" ? "Switched off. Nothing will be emailed for this one until check-ins are switched on." : round.status === "scheduled" ? `Goes out ${longDate(round.due_on)}, in the morning around 8 or 9 am Eastern.` : `Due ${longDate(round.due_on)}${round.sent_at ? `, sent ${longDate(dayInZone(round.sent_at, state.timezone))}` : ""}${round.sent_by && round.sent_by !== "schedule" ? " by a facilitator" : round.sent_by === "schedule" ? " by the schedule" : ""}.`}</span></p>
          {counts && counts.people > 0 && <div className="cir-sum"><div><span className="n">{counts.sent}</span><span className="cir-muted">{`of ${counts.people} emailed${counts.practice ? `, ${counts.practice} practice ${counts.practice === 1 ? "address" : "addresses"} not sent` : ""}`}</span></div>
            <div><span className="n">{counts.answered}</span><span className="cir-muted">of {counts.people} answered</span></div>
            <div><span className="n">{stepsDone}</span><span className="cir-muted">of {steps.length} first steps done</span></div>
            <div><span className="n">{offScript}</span><span className="cir-muted">to follow up</span></div></div>}
          {((round.status === "scheduled" && !round.superseded) || round.status === "sending" || (round.status === "sent" && counts && counts.failed > 0)) && panel !== "send" &&
            <div className="cir-actions"><button className="show-button is-primary" type="button" disabled={busy} onClick={() => setPanel("send")}><Send size={16} aria-hidden="true" />{counts && counts.failed > 0 ? "Send again to the ones that failed" : "Send now"}</button></div>}
          {panel === "send" && <div className="cir-confirm" role="group" aria-label="Send now">
            {state.practice ? <p><strong>Send the {round.day}-day check-in now?</strong> This is the practice room, so nobody is emailed. Each person gets a row here, and you can open their page with Open as this person.</p>
              : <p><strong>Send the {round.day}-day check-in now?</strong> This emails real people: each of the {state.owners} {state.owners === 1 ? "owner gets" : "owners get"} one email with a link to their own check-in. Addresses ending in .example, .invalid or .test are never emailed. It can&rsquo;t be taken back.</p>}
            <div className="cir-actions"><button className="show-button is-primary" type="button" disabled={busy} onClick={() => void send()}>{state.practice ? "Send now" : "Email them now"}</button><button className="show-button" type="button" onClick={() => setPanel(null)}>Cancel</button></div></div>}
          {panel === "off" && <div className="cir-confirm" role="group" aria-label="Switch off check-ins">
            <p><strong>Switch off the check-ins that haven&rsquo;t gone out?</strong> Nothing more will be emailed. Rounds already sent stay as they are, and you can switch them back on.</p>
            <div className="cir-actions"><button className="show-button is-primary" type="button" disabled={busy} onClick={() => void post({ action: "switch", on: false }).then(() => { setPanel(null); setSay({ text: "Check-ins are switched off." }); })}>Switch off</button><button className="show-button" type="button" onClick={() => setPanel(null)}>Cancel</button></div></div>}
        </section>

        {counts && counts.failed > 0 && <p className="cir-banner is-warn"><MailX size={18} aria-hidden="true" /><span><strong>{counts.failed === 1 ? "One email didn't go through." : `${counts.failed} emails didn't go through.`}</strong> Check the address, then use Send again.</span></p>}

        {round.recipients.length > 0 && <div className="cir-cols">
          <div className="cir-main">
            <section className="cir-card"><div><p className="ctl-eyebrow">First steps</p><h3>What people said</h3></div>
              {steps.length === 0 ? <p className="cir-muted">Nobody owns a first step.</p> :
                <table className="cir-table"><thead><tr><th>First step</th><th>Owner</th><th>Answer</th><th>Note</th></tr></thead><tbody>
                  {steps.map(s => <tr key={s.id + s.who}><td><b>{s.text}</b></td><td>{s.who}</td><td><Chip answer={s.answer} /></td><td>{s.note || <span className="cir-muted">No note</span>}</td></tr>)}</tbody></table>}</section>
            <section className="cir-card"><div><p className="ctl-eyebrow">Goals</p><h3>Where each goal stands</h3></div>
              {goals.length === 0 ? <p className="cir-muted">Nobody owns a goal.</p> : <>
                <table className="cir-table"><thead><tr><th>Goal</th><th>Owner</th><th>Ends</th><th>Status</th><th>What would help</th></tr></thead><tbody>
                  {goals.map(g => <tr key={g.id + g.who}><td><b>{g.title}</b></td><td>{g.who}</td><td>{g.end ? shortDate(g.end) : <span className="cir-muted">No date</span>}</td><td><Chip answer={g.answer} /></td><td>{g.note || <span className="cir-muted">Nothing added</span>}</td></tr>)}</tbody></table>
                <div className="cir-goals" aria-label="Goals by status">{goalAnswers.map(a => { const list = goals.filter(g => g.answer === a); return list.length ? <div className="cir-goal-group" key={a}><h4>{answerLabel[a]}, {list.length}</h4><ul>{list.map(g => <li key={g.id + g.who}>{g.title}, {g.who}</li>)}</ul></div> : null; })}</div></>}</section>
            {earlier && <section className="cir-card"><div><p className="ctl-eyebrow">Progress</p><h3>Since the {earlier.day}-day check-in</h3></div>
              {moved.length === 0 ? <p className="cir-muted">Nothing has been answered in both rounds yet.</p> :
                <table className="cir-table"><thead><tr><th>Item</th><th>Owner</th><th>{earlier.day} days</th><th>{round.day} days</th></tr></thead><tbody>
                  {moved.map(m => <tr key={m.id + m.who}><td><b>{m.text}</b></td><td>{m.who}</td><td><Chip answer={m.was} /></td><td><Chip answer={m.answer} />{m.was === m.answer && <span className="cir-muted"> No change</span>}</td></tr>)}</tbody></table>}</section>}
          </div>
          <aside className="cir-side">
            <section className="cir-card"><div><p className="ctl-eyebrow">Follow-ups</p><h3>{follow.filter(f => !f.done).length} to follow up</h3></div>
              {follow.length === 0 ? <p className="cir-muted">Nobody is stuck, and no goal is at risk or off track.</p> : follow.map(f => <div key={f.answer_id} className={`cir-fu${f.done ? " is-done" : ""}`}>
                <div className="t"><b>{f.who}</b><span className="what">{f.what}</span><span className="cir-muted">{f.kind === "step" ? "Marked stuck" : `Goal is ${answerLabel[f.answer].toLowerCase()}`}{f.note ? `: ${f.note}` : ""}</span></div>
                {f.done ? <button className="show-button" type="button" disabled={busy} onClick={() => void mark(f.answer_id, false)}><CircleCheck size={14} aria-hidden="true" />Clear the follow-up</button>
                  : <button className="show-button" type="button" disabled={busy} onClick={() => void mark(f.answer_id, true)}><Flag size={14} aria-hidden="true" />Mark followed up</button>}</div>)}</section>
            <section className="cir-card"><div><p className="ctl-eyebrow">Who hasn&rsquo;t answered</p><h3>{waiting.length === 0 ? "Everyone has answered" : `${waiting.length} ${waiting.length === 1 ? "person" : "people"} to hear from`}</h3></div>
              {waiting.map(r => <div key={r.id} className="cir-fu"><div className="t"><b>{r.name}</b>
                <span className="cir-muted">{r.send_result === "practice_address" || r.practice ? "Practice address, not sent" : r.send_result === "failed" ? "The email didn't go through" : r.opened_at ? "Opened the email, hasn't answered" : r.send_result === "sent" ? "Hasn't opened the email" : "Not sent yet"}</span></div>
                {(r.send_result === "practice_address" || r.practice) && <button className="show-button" type="button" disabled={busy} onClick={() => void openAs(r.id)}><UserRound size={14} aria-hidden="true" />Open as this person</button>}
                {r.send_result === "failed" && <Bell size={18} aria-label="Needs attention" />}</div>)}</section>
            {round.day === 90 && round.status === "sent" && <section className="cir-card"><div><p className="ctl-eyebrow">The last check-in</p><h3>Close the engagement?</h3></div>
              <p>This was the last check-in. {stepsDone} of {steps.length} first steps are done. When you are ready, close the engagement from its setup page. That turns off device sign-ins and ends the check-in links.</p>
              <div className="cir-actions"><Link className="show-button" href={`/setup/${engagement}`}>Open setup</Link></div></section>}
          </aside>
        </div>}
        {round.recipients.length === 0 && round.status !== "scheduled" && round.status !== "off" && !round.superseded && <p className="cir-muted">Nobody owns a first step or a goal with an email, so nobody was emailed.</p>}
        {round.status === "scheduled" && <section className="cir-card"><p className="ctl-eyebrow">Who it goes to</p><p>{state.owners === 0 ? "Nobody yet. Give each first step and goal an owner and an email in the Map." : `${state.owners} ${state.owners === 1 ? "person" : "people"}, each in their own email, listing only their own first steps and goals. The list is worked out when the round is sent, so an owner changed before then is the one emailed.`}</p></section>}
      </>}
      {!sentNow && rounds.length === 0 && state.eligible && <p className="cir-muted">Nothing has been sent yet.</p>}
    </div>
  </main>;
}

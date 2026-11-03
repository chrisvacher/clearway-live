"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, ChevronLeft, ChevronRight, MonitorSmartphone, RefreshCw, Send, Smartphone, WifiOff } from "lucide-react";
import { LiveMark } from "@/components/tv/live-mark";
import { phoneInputs } from "@/components/interactions/phone-inputs";
import { kindOf } from "@/lib/interactions/kinds";
import { PhoneContent, phoneContentWaits } from "./phone-content";
import { checkAnswer, limitHint, ownAnswers, sendsUsed, type ShownAnswer } from "@/lib/phone/policy";
import { browserStore } from "@/lib/phone/outbox";
import type { PhoneStep } from "@/lib/phone/types";
import { TvMirror } from "@/components/tv/tv-mirror";
import { useLivePhone } from "./use-live-phone";
import { QaAsk } from "@/components/interactions/qa/qa-ask";

const draftKey = (engagement: string, session: string) => `cw-draft-${engagement}-${session}`;
const statusLabel = { sent: "Sent", saved: "Saved on this phone", sending: "Sending", failed: "Not sent" } as const;

function AnswerCard({ answer, editable, onChange, onWithdraw, onDismiss }: { answer: ShownAnswer; editable: boolean; onChange: () => void; onWithdraw: () => void; onDismiss: () => void }) {
  const Icon = answer.status === "sent" ? Check : answer.status === "saved" ? WifiOff : answer.status === "sending" ? RefreshCw : null;
  return <li className={`ph-answer is-${answer.status}`}>
    <div className="ph-answer-row"><span className="ph-answer-text">{answer.text}</span><span className="ph-answer-status">{Icon && <Icon size={16} aria-hidden="true" />}{statusLabel[answer.status]}</span></div>
    {answer.status === "failed" ? <div className="ph-answer-actions"><span>{answer.reason}</span><button type="button" onClick={onDismiss}>Dismiss</button></div>
      : editable && answer.status === "sent" ? <div className="ph-answer-actions"><button type="button" onClick={onChange}>Change</button><button type="button" onClick={onWithdraw}>Withdraw</button></div> : null}
  </li>;
}

// The quiet burst countdown: a ring drawn with SVG attributes. The TV shows no countdown.
function Burst({ left, total }: { left: number; total: number }) {
  const seconds = Math.ceil(left / 1000);
  return <div className="ph-burst" role="timer" aria-label={`${seconds} seconds left to answer`}>
    <svg className="ph-burst-ring" viewBox="0 0 52 52" aria-hidden="true">
      <circle className="ph-burst-track" cx="26" cy="26" r="22" pathLength={1} />
      <circle className="ph-burst-fill" cx="26" cy="26" r="22" pathLength={1} strokeDasharray={`${Math.max(0, Math.min(1, left / total))} 1`} transform="rotate(-90 26 26)" />
    </svg>
    <div><p className="ph-burst-time">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</p><p className="ph-muted">left to answer</p></div>
  </div>;
}

// The participant's phone in the live room. It follows the room, can look back
// at steps already reached and answer any still open, and never runs ahead.
export function LivePhone({ engagement, church, name }: { engagement: string; church: string; name?: string | null }) {
  const phone = useLivePhone(engagement);
  const { frame, room } = phone;
  const [viewing, setViewing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ id: string; revision: number } | null>(null);
  const [bannerSeen, setBannerSeen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const input = useRef<HTMLTextAreaElement>(null);
  const burstLength = useRef<{ ends: string; total: number } | null>(null);

  const liveId = frame?.state.live_session_id ?? null;
  // The steps the room has reached, in run-of-show order, with the live step taken from the room itself.
  const steps: PhoneStep[] = useMemo(() => {
    const live = frame?.session && liveId ? frame.session : null;
    const list = (room?.sessions ?? []).map(s => s.id === liveId && live ? { ...s, state: live.state, prompt: live.prompt, phone_depth: frame?.phone_depth ?? s.phone_depth,
      options: live.options ?? s.options, kind: live.kind ?? s.kind, max_sends: live.max_sends, max_characters: live.max_characters, max_words: live.max_words } : s);
    if (live && liveId && !list.some(s => s.id === liveId)) list.push({ id: liveId, title: live.title, part: "", segment: "", interaction: live.interaction, state: live.state, options: live.options, kind: live.kind,
      prompt: live.prompt, phone_depth: frame?.phone_depth ?? "", max_sends: live.max_sends, max_characters: live.max_characters, max_words: live.max_words, closed_at: null });
    return list;
  }, [room, frame, liveId]);
  const shownId = viewing && viewing !== liveId && steps.some(s => s.id === viewing) ? viewing : liveId;
  const view = steps.find(s => s.id === shownId) ?? null;
  const isLive = Boolean(view && view.id === liveId);
  const lookingBack = Boolean(view && !isLive);
  const index = steps.findIndex(s => s.id === shownId);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);

  // Drafts survive phones down, a refresh and the phone going to sleep.
  useEffect(() => {
    if (!shownId || drafts[shownId] !== undefined) return;
    setDrafts(d => ({ ...d, [shownId]: browserStore.get(draftKey(engagement, shownId)) ?? "" }));
  }, [shownId, drafts, engagement]);
  const draft = shownId ? drafts[shownId] ?? "" : "";
  const setDraft = (value: string) => { if (!shownId) return; setDrafts(d => ({ ...d, [shownId]: value })); browserStore.set(draftKey(engagement, shownId), value); };

  // When the room moves, the phone follows, unless the person is typing an earlier answer.
  const lastLive = useRef(liveId);
  useEffect(() => {
    if (lastLive.current === liveId) return;
    lastLive.current = liveId;
    const typing = document.activeElement === input.current && Boolean(input.current?.value.trim());
    if (!typing) { setViewing(null); setEditing(null); }
  }, [liveId]);

  const burstEndsAt = isLive ? frame?.state.burst_ends_at ?? null : null;
  const burstLeft = burstEndsAt ? Math.max(0, Date.parse(burstEndsAt) - (now + phone.clockOffset)) : null;
  if (burstEndsAt && burstLength.current?.ends !== burstEndsAt) burstLength.current = { ends: burstEndsAt, total: Math.max(burstLeft ?? 0, 60000) };
  // The live step is down when the facilitator puts phones down or a burst runs out.
  const down = isLive && (view?.state === "phones_down" || Boolean(frame?.state.phones_down) || burstLeft === 0);
  const running = isLive && (view?.state === "live" || view?.state === "phones_down");
  const kind = kindOf(view), Input = view ? phoneInputs[view.interaction] : undefined;
  const asks = Boolean(view && kind?.input);
  const textForm = asks && !Input;
  const takesInput = asks && (isLive ? view!.state === "live" && !down : view!.state === "open");
  const closed = asks && view!.state === "closed";

  const mine = view ? ownAnswers(view.id, phone.answers, phone.entries, phone.online, kind?.one_per_person) : [];
  const used = view ? sendsUsed(view.id, phone.answers, phone.entries) : 0;
  const check = view && textForm ? checkAnswer(draft, view) : { ok: false, message: "", count: "" };
  const atLimit = Boolean(view && !editing && used >= view.max_sends);
  const waiting = phone.entries.some(e => e.request.queuedAt && e.state !== "failed");
  const named = isLive && frame?.session?.settings?.anonymous === false;

  function send(event: FormEvent) {
    event.preventDefault();
    if (!view || !takesInput || !textForm || !check.ok || atLimit) return;
    const text = draft.trim();
    if (editing) phone.submit({ id: editing.id, session: view.id, revision: editing.revision + 1, action: "change", text });
    else phone.submit({ id: crypto.randomUUID(), session: view.id, revision: 0, action: "submit", text });
    setDraft(""); setEditing(null); setBannerSeen(true);
  }
  const revisionOf = (answer: ShownAnswer) => Math.max(answer.revision, ...phone.entries.filter(e => e.request.id === answer.id).map(e => e.request.revision));
  const go = (id: string | null) => { setViewing(id); setEditing(null); };
  const earlier = index > 0 ? steps[index - 1] : index < 0 ? steps[steps.length - 1] ?? null : null;
  const later = lookingBack ? steps[index + 1] ?? null : null;

  const reconnecting = !phone.online || waiting;
  const markState = down && running ? "down" as const : isLive && view?.state === "live" && asks ? "live" as const : null;
  const marker = <>{phone.online && !waiting && isLive && frame?.state.show_tv_on_phones && <span className="ph-marker"><MonitorSmartphone size={14} aria-hidden="true" />TV view</span>}
    <LiveMark phone state={markState} reconnecting={reconnecting} label={!phone.online ? "Offline" : "Reconnecting"} /></>;
  const structured = (answer: { text: string; value?: unknown }) => view && phone.submit({ id: crypto.randomUUID(), session: view.id, revision: 0, action: "submit", text: answer.text, ...(answer.value !== undefined ? { value: answer.value } : {}) });

  return <div className={`ph-app${down ? " is-dimmed" : ""}`} data-screen={(takesInput || view?.interaction === "content") && !phoneContentWaits(view) ? "phone-answering" : "phone-waiting"}>
    <div className="ph-texture" aria-hidden="true" />
    <header className="ph-head"><span className="ph-church">{church}</span><QaAsk frame={frame} viewing={isLive ? view?.id ?? null : null} answers={phone.answers} />{marker}</header>
    <div className="ph-body">
      {phone.fresh && !bannerSeen && room && room.answers.length > 0 && <p className="ph-banner" role="status"><Check size={16} aria-hidden="true" />
        <span>Signed in on this phone. Your earlier answers are here.</span><button type="button" onClick={() => setBannerSeen(true)}>OK</button></p>}
      {(earlier || lookingBack) && <nav className="ph-pager" aria-label="Steps reached">
        <button type="button" disabled={!earlier} onClick={() => earlier && go(earlier.id)}><ChevronLeft size={18} aria-hidden="true" />Earlier</button>
        {lookingBack && <button type="button" onClick={() => go(later && later.id !== liveId ? later.id : null)}>{later && later.id !== liveId ? "Later" : "Back to now"}<ChevronRight size={18} aria-hidden="true" /></button>}
      </nav>}
      {isLive && frame?.state.show_tv_on_phones && <TvMirror frame={frame} label="The TV" surface="phone" />}
      {!view ? <section className="ph-waiting" aria-live="polite">
        <h1 className="ph-headline">{name || room?.name ? `You’re in, ${name || room?.name}.` : "You’re in."}</h1>
        <p className="ph-text">Watch the screen. Questions will appear here.</p>
      </section> : <section className="ph-step" aria-live="polite">
        {lookingBack && <p className="ph-muted">{view.title} · {view.state === "open" ? "still open" : !asks ? "earlier" : "closed"}</p>}
        {isLive && burstLeft !== null && burstLeft > 0 && burstLength.current && <Burst left={burstLeft} total={burstLength.current.total} />}
        {!asks ? <PhoneContent engagement={engagement} step={view} />
          : <><h1 className="ph-prompt">{view.prompt}</h1>
            {view.phone_depth && <details className="ph-more"><summary>More detail</summary><div className="ph-depth">{view.phone_depth}</div></details>}
            {down && running && <p className="ph-down"><Smartphone size={20} aria-hidden="true" />Phones down</p>}
            {takesInput && (kind?.shares_answers === false
              ? <p className="ph-who"><span className="ph-marker">Private</span><span><strong>Who sees my answers?</strong> Only the facilitators, with your name. They never show on the screen.</span></p>
              : <p className="ph-who"><span className="ph-marker">{named ? "Named" : "Anonymous"}</span>
              <span><strong>Who sees my answers?</strong> {named ? "Your answers show on the screen with your name." : "Your answers show on the screen without your name."}</span></p>)}
            {Input && <Input step={view} mine={mine} open={takesInput} engagement={engagement} frame={frame} name={name || room?.name} send={answer => structured(answer)}
              change={(id, answer) => { const a = mine.find(x => x.id === id); if (a) phone.submit({ id, session: view.id, revision: revisionOf(a) + 1, action: "change", text: answer.text, ...(answer.value !== undefined ? { value: answer.value } : {}) }); }}
              withdraw={id => { const a = mine.find(x => x.id === id); if (a) phone.submit({ id, session: view.id, revision: revisionOf(a) + 1, action: "withdraw", text: "" }); }} />}
            {!Input && mine.length > 0 && <ul className="ph-answers" aria-label="Your answers">{mine.map(a => <AnswerCard key={a.id} answer={a} editable={takesInput}
              onChange={() => { setEditing({ id: a.id, revision: revisionOf(a) }); setDraft(a.text); input.current?.focus(); }}
              onWithdraw={() => phone.submit({ id: a.id, session: view.id, revision: revisionOf(a) + 1, action: "withdraw", text: "" })}
              onDismiss={() => phone.dismiss(a.id, a.revision)} />)}</ul>}
            {down && running && draft.trim() && <p className="ph-muted">Your draft is kept for when phones open.</p>}
            {closed && <p className="ph-text">This step is closed. Your answers are kept.</p>}
            {!takesInput && !down && !closed && isLive && !running && <p className="ph-text">Watch the screen. This will open in a moment.</p>}
          </>}
      </section>}
    </div>
    {view && takesInput && textForm && <form className="ph-foot" onSubmit={send}>
      <label className="ph-label" htmlFor="ph-answer">{editing ? "Change your answer" : "Your answer"}</label>
      <textarea ref={input} id="ph-answer" className="ph-input" rows={view.interaction === "wall" ? 3 : 1} value={draft} placeholder={view.interaction === "wall" ? "Write a sentence" : "A word or two"}
        aria-invalid={Boolean(check.message)} aria-describedby="ph-count" enterKeyHint="send" onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && view.interaction !== "wall") { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
      <p className="ph-count" id="ph-count" aria-live="polite"><span>{check.message || (atLimit ? `You’ve sent ${used} of ${view.max_sends}. Change one to say something new.` : `${limitHint(view)}. ${used} of ${view.max_sends} sent.`)}</span><span>{check.count}</span></p>
      <div className="ph-actions">{editing && <button type="button" className="ph-secondary" onClick={() => { setEditing(null); setDraft(""); }}>Cancel</button>}
        <button className="ph-send" disabled={!check.ok || atLimit}><Send size={18} aria-hidden="true" />{editing ? "Save change" : "Send"}</button></div>
    </form>}
  </div>;
}

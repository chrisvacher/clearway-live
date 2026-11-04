"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, Send } from "lucide-react";
import { TvScenes } from "@/components/tv/tv-scenes";
import { LiveMark } from "@/components/tv/live-mark";
import { phoneInputs } from "@/components/interactions/phone-inputs";
import { TvFlow } from "@/lib/tv/flow";
import { tokenMs } from "@/lib/tv/board";
import { screenType } from "@/lib/tv/policy";
import { checkAnswer } from "@/lib/phone/policy";
import type { LiveSnapshot } from "@/lib/live/types";
import type { OwnShown, PhoneStep } from "@/lib/phone/types";
import { demoDisplay, demoEngagement, demoFiltered, demoFrame, demoItems, demoKinds, demoScripts, demoSession, type DemoAnswer, type DemoKind, type DemoPlaced } from "@/lib/public/demo-room";

// The public page's demo: the real TV scenes on the real arrival flow, beside a phone
// running the real phone inputs. Eight Riverside phones answer on a script, and a
// visitor's own answer lands with them. Nothing leaves the browser.
const visitor = 8;
const holdMs = 6000, visitorHoldMs = 14000;

function useInView(el: React.RefObject<HTMLElement | null>) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = el.current; if (!node || typeof IntersectionObserver !== "function") { setSeen(true); return; }
    const observer = new IntersectionObserver(([entry]) => setSeen(entry.isIntersecting), { threshold: 0.15 });
    observer.observe(node); return () => observer.disconnect();
  }, [el]);
  return seen;
}

// variant "hero": the screen and a phone that follows it, cycling on their own (the front
// page's hero; the phone shows the first Riverside phone's own sent answer). "full": the
// screen beside a phone the visitor can answer on, with tabs to pick the interaction.
export function DemoRoom({ variant = "full" }: { variant?: "full" | "hero" }) {
  const root = useRef<HTMLDivElement>(null), tv = useRef<HTMLDivElement>(null);
  const inView = useInView(root);
  const [pick, setPick] = useState<{ kind: DemoKind; auto: boolean; run: number }>({ kind: "word_cloud", auto: true, run: 0 });
  const [frame, setFrame] = useState<LiveSnapshot | null>(null), [flow, setFlow] = useState<TvFlow | null>(null);
  const [mine, setMine] = useState<OwnShown[]>([]);
  const placed = useRef<DemoPlaced[]>([]), version = useRef(0), next = useRef(0), answeredAt = useRef(0);
  const script = demoScripts[pick.kind], session = `demo-${pick.kind}-${pick.run}`;

  // The TV's arrival flow, timed from the Clearway Live tokens, ticking every frame.
  useEffect(() => {
    const el = tv.current!, made = new TvFlow({ stagger: tokenMs(el, "cwl-delay-stagger"), staggerMin: tokenMs(el, "cwl-delay-stagger-min"),
      maxHold: tokenMs(el, "cwl-delay-max-hold"), newHold: tokenMs(el, "cwl-dur-new-hold") });
    setFlow(made);
    let raf = requestAnimationFrame(function tick() { made.tick(); raf = requestAnimationFrame(tick); });
    const settle = () => { if (document.visibilityState !== "visible") made.settle(); };
    document.addEventListener("visibilitychange", settle);
    return () => { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", settle); };
  }, []);
  // Scale the 1920x1080 stage to its box.
  useEffect(() => {
    const el = tv.current; if (!el) return;
    const fit = () => el.style.setProperty("--tv-stage-scale", String(el.clientWidth / 1920));
    const observer = new ResizeObserver(fit); observer.observe(el); fit(); return () => observer.disconnect();
  }, []);

  const offer = useCallback((land: boolean) => {
    if (!flow) return;
    version.current += 1;
    const built = demoFrame(script, session, placed.current, version.current);
    flow.offer(built.frame, land ? built.event ?? undefined : undefined);
    setFrame(built.frame);
  }, [flow, script, session]);

  // A new session: the TV prepares it behind the last one and cross-fades.
  useEffect(() => {
    placed.current = []; next.current = 0; answeredAt.current = 0; setMine([]);
    offer(false);
  }, [session, flow]); // eslint-disable-line react-hooks/exhaustive-deps

  // The room's phones, on the script's timing, only while the demo is on screen.
  useEffect(() => {
    if (!flow || !inView) return;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      const i = next.current;
      if (i < script.answers.length) {
        timer = setTimeout(() => {
          placed.current = [...placed.current, { id: `${session}-${i}`, person: i % 8, answer: script.answers[i] }];
          next.current = i + 1; offer(true); step();
        }, script.gaps[i] ?? 900);
      } else {
        const wait = answeredAt.current ? Math.max(holdMs, answeredAt.current + visitorHoldMs - Date.now()) : holdMs;
        timer = setTimeout(() => setPick(p => ({ kind: p.auto ? demoKinds[(demoKinds.indexOf(p.kind) + 1) % demoKinds.length] : p.kind, auto: p.auto, run: p.run + 1 })), wait);
      }
    };
    step();
    return () => clearTimeout(timer);
  }, [flow, inView, session]); // eslint-disable-line react-hooks/exhaustive-deps

  // The visitor's own answer joins the room as a ninth phone.
  const send = (answer: DemoAnswer) => {
    const id = `${session}-you-${Date.now()}`;
    placed.current = [...placed.current, { id, person: visitor, answer }];
    answeredAt.current = Date.now();
    const shown: OwnShown = { id, text: answer.text, value: answer.value, revision: 0, status: "sent", withdrawn: false };
    setMine(list => script.kind === "word_cloud" ? [...list, shown] : [shown]);
    setPick(p => p.auto ? { ...p, auto: false } : p);
    offer(true);
  };
  const choose = (kind: DemoKind) => setPick(p => ({ kind, auto: false, run: p.run + 1 }));

  const step: PhoneStep = useMemo(() => {
    const live = demoSession(script, session);
    return { id: session, title: live.title, part: "Demo", segment: "", interaction: live.interaction, state: "live", prompt: live.prompt, phone_depth: "",
      options: live.options, kind: live.kind, max_sends: live.max_sends, max_characters: live.max_characters, max_words: live.max_words, closed_at: null };
  }, [script, session]);
  const Input = phoneInputs[pick.kind];

  const hero = variant === "hero";
  // In the hero, the phone is the first Riverside phone: its own answers, already sent.
  const own: OwnShown[] = hero ? placed.current.filter(p => p.person === 0).map(p => ({ id: p.id, text: p.answer.text, value: p.answer.value, revision: 0, status: "sent", withdrawn: false })) : mine;
  const shownMine = hero && script.kind !== "word_cloud" ? own.slice(-1) : own;
  const screen = <div ref={tv} className="tv-demo" role="img" aria-label={`The room's screen: ${script.prompt}`} data-surface="tv" data-theme="dark" data-room="very_small"
    data-screen={screenType(frame)} data-texture="on">
    <div className="tv-stage" aria-hidden="true">
      {frame && <TvScenes status={{ status: "paired", engagement: demoEngagement, tv: "demo" }} frame={frame} flow={flow} nameLimit={14} reconnecting={false} />}
    </div>
  </div>;
  // The phone: the real phone inputs. In the hero it only shows; in the full demo the visitor answers.
  const phone = <div className="ph-app" data-screen="phone-answering">
    <header className="ph-head"><span className="ph-church">{demoDisplay.church}</span><LiveMark phone state="live" reconnecting={false} /></header>
    <div className="ph-body">
      <section className="ph-step" aria-live={hero ? undefined : "polite"}>
        <p className="ph-prompt">{script.prompt}</p>
        <p className="ph-who"><span className="ph-marker">Anonymous</span><span><strong>Who sees my answers?</strong> Your answers show on the screen without your name.</span></p>
        {Input ? <Input key={session} step={step} mine={shownMine} open send={answer => send({ text: answer.text, value: answer.value as DemoAnswer["value"] })} change={() => {}} withdraw={() => {}} />
          : <WordForm key={session} step={step} mine={shownMine} onSend={text => send({ text })} />}
      </section>
    </div>
  </div>;

  if (hero) return <div ref={root} className="demo-room is-hero">
    <div className="hero-tv">{screen}<span className="hero-tag"><span className="hero-dot" aria-hidden="true" />Live on the screen</span></div>
    <div className="hero-phone" aria-hidden="true" inert><PhoneScale>{phone}</PhoneScale></div>
  </div>;
  return <div ref={root} className="demo-room">
    <div className="demo-tabs" role="tablist" aria-label="Choose an interaction to watch">
      {demoKinds.map(kind => <button key={kind} type="button" role="tab" aria-selected={pick.kind === kind} aria-controls="demo-stage"
        className="demo-tab" onClick={() => choose(kind)}>{demoScripts[kind].label}</button>)}
    </div>
    <div className="demo-stage" id="demo-stage">
      <figure className="demo-screen">{screen}<figcaption className="demo-caption">The screen at the front of the room</figcaption></figure>
      <figure className="demo-phone">
        <div className="demo-phone-frame" data-surface="phone" data-theme="dark">{phone}</div>
        <figcaption className="demo-caption">Try it: answer here and watch it land</figcaption>
      </figure>
    </div>
  </div>;
}

// A phone drawn at its real 390 by 780 size and scaled to fit its frame, so the real phone
// screen reads as a phone at any size.
function PhoneScale({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const fit = () => el.style.setProperty("--phone-scale", String(el.clientWidth / 390));
    const observer = new ResizeObserver(fit); observer.observe(el); fit(); return () => observer.disconnect();
  }, []);
  return <div ref={box} className="phone-scale" data-surface="phone" data-theme="dark"><div className="phone-scale-inner">{children}</div></div>;
}

function WordForm({ step, mine, onSend }: { step: PhoneStep; mine: OwnShown[]; onSend: (text: string) => void }) {
  const [draft, setDraft] = useState(""), [note, setNote] = useState("");
  const check = checkAnswer(draft, step), full = mine.length >= step.max_sends;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!check.ok || full) return;
    if (demoFiltered(draft) || !demoItems(draft).length) { setNote("That answer can't go on the screen. Try another."); return; }
    onSend(draft.trim()); setDraft(""); setNote("");
  };
  return <>
    {mine.length > 0 && <ul className="ph-answers" aria-label="Your answers">{mine.map(a => <li key={a.id} className="ph-answer is-sent">
      <div className="ph-answer-row"><span className="ph-answer-text">{a.text}</span><span className="ph-answer-status"><Check size={16} aria-hidden="true" />Sent</span></div></li>)}</ul>}
    <form className="demo-form" onSubmit={submit}>
      <label className="ph-label" htmlFor="demo-answer">Your answer</label>
      <input id="demo-answer" className="ph-input" value={draft} placeholder="A word or two" autoComplete="off" maxLength={80}
        aria-invalid={Boolean(check.message || note)} aria-describedby="demo-count" onChange={e => { setDraft(e.target.value); setNote(""); }} />
      <p className="ph-count" id="demo-count" aria-live="polite"><span>{note || check.message || (full ? `You've sent ${step.max_sends}. That's the limit here.` : "Up to 3 words")}</span><span>{check.count}</span></p>
      <div className="ph-actions"><button className="ph-send" disabled={!check.ok || full}><Send size={18} aria-hidden="true" />Send</button></div>
    </form>
  </>;
}

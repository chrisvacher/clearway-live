"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { Globe, Laptop, Monitor, QrCode, Smartphone } from "lucide-react";
import type { InteractionKind } from "@/lib/interactions/kinds";

// The front page's interactive parts. Every screen shown is a real screenshot of the app
// from the Riverside Church team workshop run in CI (tests/browser/team-workshop.ts), so
// the page shows exactly what a room sees. See docs/front-page.md.

// A device frame around a screenshot: a TV with a thin bezel, or a phone.
export function TvShot({ src, alt, priority = false }: { src: string; alt: string; priority?: boolean }) {
  return <div className="shot-tv"><Image src={src} alt={alt} width={1600} height={900} sizes="(max-width: 1024px) 92vw, 760px" priority={priority} /></div>;
}
export function PhoneShot({ src, alt, priority = false }: { src: string; alt: string; priority?: boolean }) {
  return <div className="shot-phone"><Image src={src} alt={alt} width={390} height={844} sizes="240px" priority={priority} /></div>;
}

// Things fade up as they come into view. With reduced motion, or before script, they're simply there.
export function Reveal({ children, className = "", step = 0 }: { children: ReactNode; className?: string; step?: number }) {
  const el = useRef<HTMLDivElement>(null), [shown, setShown] = useState(false);
  useEffect(() => {
    const node = el.current; if (!node) return;
    if (typeof IntersectionObserver !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(true); return; }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setShown(true); observer.disconnect(); } }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    observer.observe(node); return () => observer.disconnect();
  }, []);
  return <div ref={el} className={`reveal${shown ? " is-in" : ""}${step ? ` is-step-${Math.min(step, 6)}` : ""} ${className}`}>{children}</div>;
}

// How it works: a stepper that moves on by itself until someone picks a step.
const screens = [
  { key: "tv", icon: Monitor, name: "Everyone sees the big screen", line: "The TV", text: "The question and the room's answers, in type you can read from the back. Answers appear the moment they're sent, with no names on them.", shot: { kind: "tv", src: "/home/tv-word-cloud.webp", alt: "The TV: a word cloud where youth has grown largest, with 45 answers" } },
  { key: "phone", icon: Smartphone, name: "You give input on your phone", line: "Your phone", text: "No app to install. The question, any detail or Scripture behind it, and a box for your answer. You can see and change your own answers while the step is open.", shot: { kind: "phone", src: "/home/phone-word-cloud.webp", alt: "A phone answering the word cloud, with two answers sent" } },
  { key: "control", icon: Laptop, name: "The facilitator keeps it moving", line: "The facilitator", text: "From a laptop or a phone remote, your facilitator opens each step, gives the room a few minutes to answer, spotlights what matters and moves on. This view stays private.", shot: { kind: "control", src: "/home/control-live-room.webp", alt: "The facilitator's live room: the run of show, the controls, AI combines with undo and private panels" } },
] as const;
export function ThreeScreens() {
  const [at, setAt] = useState(0), [auto, setAuto] = useState(true), root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!auto || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setAt(i => (i + 1) % screens.length), 6500);
    return () => clearInterval(timer);
  }, [auto]);
  const pick = (i: number) => { setAuto(false); setAt(i); };
  const current = screens[at];
  return <div ref={root} className="three">
    <div className="three-tabs" role="tablist" aria-label="How it works">
      {screens.map((s, i) => { const Icon = s.icon; return <button key={s.key} type="button" role="tab" id={`three-tab-${s.key}`} aria-selected={i === at} aria-controls="three-panel"
        className={`three-tab${i === at ? " is-on" : ""}${i === at && auto ? " is-timing" : ""}`} onClick={() => pick(i)}>
        <span className="three-tab-icon"><Icon size={20} aria-hidden="true" /></span>
        <span className="three-tab-copy"><span className="three-tab-line">{s.line}</span><span className="three-tab-name">{s.name}</span><span className="three-tab-text">{s.text}</span></span>
        <span className="three-tab-bar" aria-hidden="true" />
      </button>; })}
    </div>
    <div className="three-panel" id="three-panel" role="tabpanel" aria-labelledby={`three-tab-${current.key}`}>
      {screens.map((s, i) => <div key={s.key} className={`three-shot is-${s.shot.kind}${i === at ? " is-on" : ""}`} aria-hidden={i !== at}>
        {s.shot.kind === "phone" ? <PhoneShot src={s.shot.src} alt={s.shot.alt} /> : s.shot.kind === "tv" ? <TvShot src={s.shot.src} alt={s.shot.alt} />
          : <div className="shot-laptop"><Image src={s.shot.src} alt={s.shot.alt} width={1440} height={1100} sizes="(max-width: 1024px) 92vw, 720px" /></div>}
      </div>)}
    </div>
  </div>;
}

// The interaction gallery: pick one, see it on the TV and on a phone.
export type GalleryItem = { key: string; name: string; tag: string; text: string; tv: string; tvAlt: string; phone: string; phoneAlt: string };
export function Gallery({ items }: { items: GalleryItem[] }) {
  const [at, setAt] = useState(0), item = items[at];
  return <div className="gallery">
    <div className="gallery-list" role="tablist" aria-label="Ways to answer" aria-orientation="vertical">
      {items.map((it, i) => <button key={it.key} type="button" role="tab" id={`gallery-tab-${it.key}`} aria-selected={i === at} aria-controls="gallery-panel"
        className={`gallery-item${i === at ? " is-on" : ""}`} onClick={() => setAt(i)}
        onKeyDown={e => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const n = (i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length; setAt(n); document.getElementById(`gallery-tab-${items[n].key}`)?.focus(); } }}>
        <span className="gallery-item-tag">{it.tag}</span><span className="gallery-item-name">{it.name}</span>
      </button>)}
    </div>
    <div className="gallery-panel" id="gallery-panel" role="tabpanel" aria-labelledby={`gallery-tab-${item.key}`}>
      <div className="gallery-devices" key={item.key}>
        <TvShot src={item.tv} alt={item.tvAlt} />
        <PhoneShot src={item.phone} alt={item.phoneAlt} />
      </div>
      <div className="gallery-copy"><h3 className="gallery-name">{item.name}</h3><p>{item.text}</p></div>
    </div>
  </div>;
}

// The numbers band. Every tool the room can answer with, named as the run of show names it.
// Typed against the interaction library, so a new kind can't be left out of the count.
const tools: Record<Exclude<InteractionKind, "content">, string> = {
  word_cloud: "Word cloud", wall: "Open text", qa: "Q&A", choice: "Multiple choice", scale: "Scale", ranking: "Ranking",
  points: "100 points", grid: "2x2 grid", form: "Private form", sign: "Sign together", statements: "Statements",
  lens: "Lens wall", lens_summary: "Lens summary", candidates: "Candidate priorities", goals: "CORE goals",
  intent: "Commander's intent", bullets: "Outcome bullets", confirm: "Outcome confirm",
};
export const toolNames = Object.values(tools);
export function StatsBand() {
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setAt(i => (i + 1) % toolNames.length), 1800);
    return () => clearInterval(timer);
  }, []);
  return <div className="home-width stats-row">
    <Reveal className="stat">
      <div className="stat-visual" aria-hidden="true"><Smartphone size={22} /><span className="stat-track"><span className="stat-dot" /></span><Monitor size={22} /></div>
      <p className="stat-n">&lt;1<small>s</small></p>
      <p className="stat-l">from a phone to the screen</p>
      <p className="stat-s">No refresh and no reveal. Each answer lands the moment it&apos;s sent.</p>
    </Reveal>
    <Reveal className="stat" step={1}>
      <div className="stat-visual" aria-hidden="true"><span className="stat-pill"><Globe size={16} />live.clearway.co</span></div>
      <p className="stat-n">0</p>
      <p className="stat-l">apps to install</p>
      <p className="stat-s">Any phone&apos;s browser works. Nothing to download before the retreat.</p>
    </Reveal>
    <Reveal className="stat" step={2}>
      <div className="stat-visual" aria-hidden="true"><span key={at} className="stat-pill is-tool">{toolNames[at]}</span></div>
      <p className="stat-n">{toolNames.length}</p>
      <p className="stat-l">facilitation tools built in</p>
      <p className="stat-s">From a quick word cloud to the CORE goals that close the retreat.</p>
    </Reveal>
    <Reveal className="stat" step={3}>
      <div className="stat-visual" aria-hidden="true"><span className="stat-pill is-code">A7C3E91F</span><QrCode size={22} /></div>
      <p className="stat-n">1</p>
      <p className="stat-l">code to join the room</p>
      <p className="stat-s">On the TV beside a QR code, from the first step to the last.</p>
    </Reveal>
  </div>;
}

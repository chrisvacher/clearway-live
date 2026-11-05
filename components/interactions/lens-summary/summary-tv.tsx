"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Check } from "lucide-react";
import type { TvViewProps } from "@/components/interactions/tv-views";
import { AiMark, useAiSweep } from "@/components/interactions/ai/ai-icon";
import { LensHeading } from "@/components/wayfinding/lens-icon";
import { useFitCount } from "@/components/tv/use-fit-count";
import { flushSync } from "react-dom";
import { caretMs, leaveMs, glideMoved, lineSize, moreOnPhones, reconcile, shownLines, shownSuggestions, struckHoldMs, summaryOf, type Part, type Row } from "@/lib/interactions/lens-summary";
import "@/components/interactions/ai/ai.css";
import "./lens-summary.css";

// INT-18's TV view: one lens's 10-year Future summary on one screen. It is alive. A line the facilitator
// types replaces itself in place in small batches; a fold arrives as a tracked change (underlined words in,
// struck words out after a beat) while the lines glide; a new suggestion lands as an anonymous card. Rows keep
// their place in the page across versions (reconcile), so nothing redraws, resets or waits for a reveal.
const stateLine = { drafting: "AI is drafting the summary", folding: "AI is folding in suggestions" } as const;

function Words({ parts, text, leave }: { parts: Part[] | null; text: string; leave: boolean }) {
  if (!parts) return <>{text}</>;
  return <>{parts.map((p, i) => p.k === "keep" ? <span key={i}>{p.t} </span> : <span key={i} className={`lsm-${p.k}${p.k === "del" && leave ? " is-leaving" : ""}`} data-tc={p.k}>{p.t} </span>)}</>;
}

// Glide: when a child's place in the layout changes (a fold, a line typed, a card arriving, or anything above it
// resizing) it moves from where it was last seen to where it now sits, on --cwl-dur-make-room (FLIP). Every frame
// records each child's visual top and its layout top (the visual top minus its own glide's translateY), so a change that
// lands mid-glide starts from the child's visual place, and layout is compared layout to layout: a render that moved
// nothing leaves every glide in flight alone. The TV's parent re-renders this view about every frame, and a glide
// restarted on each render never leaves its first frame.
const shiftOf = (el: Element) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42 || 0;
function useGlide(host: RefObject<HTMLElement | null>) {
  const seen = useRef(new Map<Element, number>()), laid = useRef(new Map<Element, number>());
  useEffect(() => {
    let frame = 0;
    const read = () => {
      const root = host.current;
      if (root) {
        const visual = new Map<Element, number>(), layout = new Map<Element, number>();
        for (const el of Array.from(root.children)) { const top = el.getBoundingClientRect().top; visual.set(el, top); layout.set(el, top - shiftOf(el)); }
        seen.current = visual; laid.current = layout;
      }
      frame = requestAnimationFrame(read);
    };
    frame = requestAnimationFrame(read);
    return () => cancelAnimationFrame(frame);
  }, [host]);
  useLayoutEffect(() => {
    const root = host.current;
    if (!root) return;
    const moves: [HTMLElement, number][] = [], reduced = document.documentElement.dataset.motion === "reduced", now = new Map<Element, number>();
    for (const node of Array.from(root.children)) {
      const el = node as HTMLElement, lay = el.getBoundingClientRect().top - shiftOf(el), was = laid.current.get(el), before = seen.current.get(el);
      now.set(el, lay);
      if (!reduced && before !== undefined && glideMoved(was, lay)) moves.push([el, before - lay]);
    }
    for (const [el, shift] of moves) { el.style.transition = "none"; el.style.transform = `translateY(${shift}px)`; }
    if (moves.length) void root.offsetHeight;
    for (const [el] of moves) { el.style.transition = ""; el.style.transform = ""; }
    laid.current = new Map([...laid.current, ...now]);
  });
}

// Fit: every line of the summary shows whole in the sheet, at every room size. A long summary that needs more room than the
// sheet has steps the whole screen's type down evenly (--lsm-fit scales the room's ramp, as the TV's own fit step does) until it
// fits, down to the floor ramp of the Very large room; the lines alone may then step on down to that ramp's floor size, never
// below. The size is searched a pixel of line type at a time before paint, whenever the lines, the struck words or the room
// change, and set before the glide runs, so the glide sees the lines' new places and moves them there: nothing jumps.
function useLineFit(list: RefObject<HTMLOListElement | null>, sign: string) {
  const seen = useRef(""), watch = useRef<{ el: Element | null; ro: ResizeObserver | null; kids: Set<Element> }>({ el: null, ro: null, kids: new Set() }), [, redraw] = useState(0);
  const fit = () => {
    const el = list.current, host = el?.closest<HTMLElement>(".tv-layer") ?? el?.closest<HTMLElement>(".lsm-tv");
    if (!el || !host) return false;
    const was = host.style.getPropertyValue("--lsm-fit"), px = (name: string) => parseFloat(getComputedStyle(el).getPropertyValue(name));
    const key = () => `${sign}|${el.clientWidth}x${el.clientHeight}|${px("--lsm-line-size")}|${px("--lsm-line-least")}`;
    if (key() === seen.current) return false;
    host.style.setProperty("--lsm-fit", "1");
    const most = px("--lsm-line-size"), least = px("--lsm-line-least");
    if (!(most > 0) || !(least > 0)) { seen.current = key(); return false; }
    const need = () => Array.from(el.children).reduce((h, c) => h + (c as HTMLElement).offsetHeight, 0);
    const scale = (size: number) => size >= most ? "1" : String(size / most);
    const fits = (size: number) => { host.style.setProperty("--lsm-fit", scale(size)); return need() <= el.clientHeight + 0.5; };
    const fit = scale(lineSize(fits, least, most));
    host.style.setProperty("--lsm-fit", fit);
    seen.current = key();
    return fit !== (was || "1");
  };
  const latest = useRef(fit);
  latest.current = fit;
  useLayoutEffect(() => {
    fit();
    // The sheet and its lines also change size without a render of this view (the TV's own fit step changing the ramp around
    // them); a new fit then re-renders, so the glide moves the lines to their new places.
    const el = list.current, w = watch.current;
    if (el !== w.el) {
      w.ro?.disconnect(); w.el = el; w.ro = null; w.kids = new Set();
      if (el && typeof ResizeObserver === "function") { w.ro = new ResizeObserver(() => { if (latest.current()) flushSync(() => redraw(n => n + 1)); }); w.ro.observe(el); }
    }
    if (el && w.ro) {
      for (const kid of w.kids) if (kid.parentElement !== el) { w.ro.unobserve(kid); w.kids.delete(kid); }
      for (const kid of Array.from(el.children)) if (!w.kids.has(kid)) { w.kids.add(kid); w.ro.observe(kid); }
    }
  });
  useEffect(() => () => watch.current.ro?.disconnect(), []);
}

export function LensSummaryView({ frame }: TvViewProps) {
  const res = useMemo(() => summaryOf(frame?.state.results), [frame?.state.results]);
  const summary = res.summary, shown = summary ? shownLines(summary) : [], versionId = summary?.versionId ?? "";
  const linesRef = useRef<HTMLOListElement>(null), cardsRef = useRef<HTMLUListElement>(null);
  const keys = useRef(0), [rows, setRows] = useState<Row[]>([]), [leave, setLeave] = useState(false), [caret, setCaret] = useState<string | null>(null);
  // What decides the lines' height: each row's words (struck and inserted ones too), the struck words leaving, and the caret.
  useLineFit(linesRef, `${rows.map(r => `${r.key}:${r.state}:${r.parts ? r.parts.map(p => p.k + p.t).join(" ") : r.text}`).join("\u0001")}|${leave}|${caret}`);
  useGlide(linesRef); useGlide(cardsRef);
  // The signature of what is on screen: the version, and every line's text (a facilitator's edit keeps the version).
  const sign = shown.map(l => `${l.id}:${l.text}`).join("\u0001");
  useEffect(() => {
    if (!summary) { setRows([]); return; }
    setRows(prev => reconcile(prev, shown.map(l => ({ id: l.id, text: l.text })), summary.changes, summary.tracked, () => `r${++keys.current}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId, sign]);
  // Struck words stay readable for a beat, then leave while the paragraph reflows.
  useEffect(() => {
    setLeave(false);
    if (!versionId) return;
    const a = setTimeout(() => setLeave(true), struckHoldMs), b = setTimeout(() => setRows(r => r.some(x => x.state === "gone" || x.parts?.some(q => q.k === "del")) ? r.filter(x => x.state !== "gone").map(x => x.parts?.some(q => q.k === "del") ? { ...x, parts: x.parts.filter(q => q.k !== "del") } : x) : r), struckHoldMs + leaveMs);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [versionId]);
  // The caret follows the line the facilitator is typing and clears itself when they stop.
  useEffect(() => {
    if (!res.typing) return;
    setCaret(res.typing);
    const t = setTimeout(() => setCaret(null), caretMs);
    return () => clearTimeout(t);
  }, [res.typing, sign]);
  const sweep = useAiSweep<HTMLDivElement>(res.aiState === "drafting" || res.aiState === "folding" ? [`${res.aiState}:${versionId}`] : summary?.author === "ai" ? [versionId] : [], res.lens ? String(res.lens) : null);
  const names = res.lens ? Object.assign([] as string[], { [res.lens - 1]: res.lensName }) : null;
  // The suggestion cards that fit whole above the "+ n more on phones" line; the rest are counted on it.
  const cards = res.suggestions.slice(0, shownSuggestions), fit = useFitCount(cardsRef, cards.length, "start", 0);
  const further = Math.max(0, res.tally.suggest - fit);
  return <div className="lsm-tv" data-lens-summary data-ai-state={res.aiState} data-signed={summary?.signed ? "true" : "false"}>
    <header className="lsm-head">
      {res.lens && <LensHeading lens={res.lens} names={names} />}
      <ol className="lsm-steps" aria-label="The five lenses">
        {res.lenses.map(l => <li key={l.lens} data-state={l.state} aria-current={l.state === "now" ? "step" : undefined}>{l.state === "signed" ? <Check size={20} aria-hidden="true" /> : null}<span>{l.name}</span></li>)}
      </ol>
    </header>
    <div className="lsm-body">
      <section className="lsm-sheet" aria-label="10-year Future summary">
        <div className="lsm-band" ref={sweep}>
          {summary ? <>
            <span className="lsm-who">{summary.author === "ai" ? <><AiMark /> Drafted by AI</> : "Edited by the facilitator"}</span>
            <span className="lsm-ver">Version {summary.version}</span>
            {summary.signed && <span className="lsm-signed"><Check size={22} aria-hidden="true" /> {summary.decision || "Decided"}</span>}
          </> : <span className="lsm-who"><AiMark /> 10-year Future</span>}
          {(res.aiState === "drafting" || res.aiState === "folding") && summary && <span className="lsm-busy" role="status">{stateLine[res.aiState]}</span>}
        </div>
        {summary ? <ol className="lsm-lines" ref={linesRef}>
          {rows.map(r => <li key={r.key} className={`lsm-line is-${r.state}${r.state === "gone" && leave ? " is-leaving" : ""}`} data-line={r.id} data-state={r.state}>
            <div className="lsm-line-in"><span key={r.rev} className="lsm-text"><Words parts={r.parts} text={r.text} leave={leave} /></span>{caret === r.id && r.state !== "gone" && <span className="lsm-caret" aria-hidden="true" />}</div>
          </li>)}
        </ol> : <p className="lsm-empty" role="status">{stateLine[res.aiState as keyof typeof stateLine] ?? "The summary for this lens is coming up"}{res.lensName ? ` for ${res.lensName}` : ""}</p>}
        {summary && summary.more > 0 && <p className="lsm-more" data-more>{moreOnPhones(summary.more)}</p>}
      </section>
      <aside className="lsm-side" aria-label="What the room says">
        <dl className="lsm-tally" aria-live="polite">
          <div><dt>Approved</dt><dd data-tally="approve">{res.tally.approve}</dd></div>
          <div><dt>Suggested a change</dt><dd data-tally="suggest">{res.tally.suggest}</dd></div>
        </dl>
        <ul className="lsm-cards" ref={cardsRef}>
          {cards.map((c, i) => <li key={c.id} className={`lsm-card${i >= fit ? " is-out" : ""}`} aria-hidden={i >= fit ? true : undefined} data-suggestion>{c.text}</li>)}
        </ul>
        {further > 0 && <p className="lsm-more" data-more-suggestions>{moreOnPhones(further)}</p>}
      </aside>
    </div>
  </div>;
}

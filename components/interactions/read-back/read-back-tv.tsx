"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import type { TvViewProps } from "@/components/interactions/tv-views";
import { LensIcon } from "@/components/wayfinding/lens-icon";
import { useFitCount } from "@/components/tv/use-fit-count";
import { Words, useGlide, useLineFit } from "@/components/interactions/lens-summary/summary-tv";
import { changeText, leaveMs, missingText, moreOnPhones, readBackOf, reconcile, shownMissing, shownReadBack, share, struckHoldMs, yesText, type ReadBackItem, type ReadBackResults, type Row } from "@/lib/interactions/read-back";
import type { LensNumber } from "@/lib/wayfinding/lens";
import "./read-back.css";

// D2-03's TV view (ReadBackLens, ReadBackTally, MissingList, LensProgress, TrackedChange): one item at a time, a signed-off lens
// summary or a reviewed outcome, with "Did we hear you right?", a live tally that names no leader, and the room's anonymous
// "What's missing?" answers. It is alive. The tally bars grow from where they are; a correction folds in as a tracked change
// (struck words stay readable for a beat, inserted words stay underlined until the item is settled) while the lines glide; moving
// on lifts the text out and the next item rises in. Rows keep their place in the page across versions (reconcile).
const liftMs = 400, riseMs = 700, sweepMs = 1500;

function Chip({ chip, sweep }: { chip: ReadBackResults["items"][number]; sweep: boolean }) {
  return <li className={`rbk-chip is-${chip.state}${sweep ? " is-sweeping" : ""}`} data-state={chip.state} data-kind={chip.kind} aria-current={chip.state === "now" ? "step" : undefined}>
    <span className="rbk-sweep" aria-hidden="true" /><Check size={20} className="rbk-ok" aria-hidden="true" /><span className="rbk-nm">{chip.label}</span>
    {chip.state === "settled" ? <span className="sr-only"> (settled)</span> : null}
  </li>;
}

function Bar({ label, n, of, which }: { label: string; n: number; of: number; which: "yes" | "change" }) {
  return <div className="rbk-bar-row" data-tally={which}>
    <dt>{label}</dt><dd>{n}</dd>
    <span className="rbk-bar" aria-hidden="true"><i ref={el => { el?.style.setProperty("--rbk-w", `${share(n, of)}%`); }} /></span>
  </div>;
}

export function ReadBackView({ frame }: TvViewProps) {
  const res = useMemo(() => readBackOf(frame?.state.results), [frame?.state.results]);
  // What the main column shows. It follows the room, except across a move to another item: the old text lifts out first.
  const [shown, setShown] = useState<ReadBackResults>(res), [phase, setPhase] = useState<"in" | "lift" | "rise">("in");
  const latest = useRef(res), lifting = useRef(false), shownId = useRef<string | null>(res.item?.id ?? null);
  latest.current = res;
  useEffect(() => {
    const next = res.item?.id ?? null;
    if (lifting.current) return;
    if (shownId.current === null || next === null || next === shownId.current) { shownId.current = next ?? shownId.current; setShown(res); return; }
    lifting.current = true; setPhase("lift");
    const reduced = document.documentElement.dataset.motion === "reduced";
    setTimeout(() => { lifting.current = false; shownId.current = latest.current.item?.id ?? null; setRows([]); setShown(latest.current); setPhase(reduced ? "in" : "rise"); }, reduced ? 0 : liftMs);
    setTimeout(() => setPhase("in"), (reduced ? 0 : liftMs) + riseMs);
  }, [res]);
  const item: ReadBackItem | null = shown.item, versionId = item?.versionId ?? "", settled = item?.settled ?? false;
  const linesRef = useRef<HTMLOListElement>(null), cardsRef = useRef<HTMLUListElement>(null);
  const keys = useRef(0), [rows, setRows] = useState<Row[]>([]), [leave, setLeave] = useState(false);
  const lines = item ? shownReadBack(item) : [];
  const marks = useRef(new Map<string, Row["parts"]>());
  marks.current = new Map(lines.map(l => [l.id, l.marks]));
  useLineFit(linesRef, `${rows.map(r => `${r.key}:${r.state}:${r.parts ? r.parts.map(p => p.k + p.t).join(" ") : r.text}`).join("\u0001")}|${leave}|${phase}`);
  useGlide(linesRef); useGlide(cardsRef);
  const sign = lines.map(l => `${l.id}:${l.text}`).join("\u0001");
  useEffect(() => {
    if (!item) { setRows([]); return; }
    setRows(prev => reconcile(prev, lines.map(l => ({ id: l.id, text: l.text })), item.settled ? [] : item.changes, item.tracked && !item.settled, () => `r${++keys.current}`)
      .map(r => r.parts || r.state === "gone" ? r : { ...r, parts: marks.current.get(r.id) ?? null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId, sign]);
  // Struck words stay readable for a beat, then leave while the paragraph reflows. Inserted words keep their underline
  // (against the line as it first stood) until the item is settled.
  useEffect(() => {
    setLeave(false);
    if (!versionId) return;
    const a = setTimeout(() => setLeave(true), struckHoldMs);
    const b = setTimeout(() => setRows(r => r.some(x => x.state === "gone" || x.parts?.some(q => q.k === "del")) ? r.filter(x => x.state !== "gone").map(x => x.parts?.some(q => q.k === "del") ? { ...x, parts: marks.current.get(x.id) ?? null } : x) : r), struckHoldMs + leaveMs);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [versionId]);
  useEffect(() => { if (settled) setRows(r => r.map(x => x.parts ? { ...x, parts: null } : x)); }, [settled]);

  // The progress strip follows the room at once: the current chip moves along it as a colour change in place, and a chip that
  // has just been settled takes Lime across once, then rests as an outlined check.
  const seen = useRef(new Map<string, string>()), [sweeping, setSweeping] = useState<string[]>([]);
  useEffect(() => {
    const fresh = res.items.filter(c => c.state === "settled" && seen.current.has(c.id) && seen.current.get(c.id) !== "settled").map(c => c.id);
    seen.current = new Map(res.items.map(c => [c.id, c.state]));
    if (!fresh.length || document.documentElement.dataset.motion === "reduced") return;
    setSweeping(s => [...s, ...fresh]);
    const t = setTimeout(() => setSweeping(s => s.filter(x => !fresh.includes(x))), sweepMs);
    return () => clearTimeout(t);
  }, [res.items]);

  const cards = shown.missing.slice(0, shownMissing), fit = useFitCount(cardsRef, cards.length, "start", 0);
  const further = Math.max(0, shown.missingCount - fit);
  const of = Math.max(shown.of, shown.tally.yes + shown.tally.change, 1);
  return <div className="lsm-tv rbk-tv" data-read-back data-item={item?.id ?? ""} data-version={versionId} data-settled={settled ? "true" : "false"} data-phase={phase}>
    <header className="rbk-head">
      <ol className="rbk-progress" aria-label="Items in this confirm">
        {res.items.map(c => <Chip key={c.id} chip={c} sweep={sweeping.includes(c.id)} />)}
      </ol>
    </header>
    <div className="lsm-body rbk-body">
      <section className={`lsm-sheet rbk-sheet is-${phase}`} aria-label={item ? `${item.heading}` : "Confirm"}>
        {item ? <>
          <h2 className="rbk-h">{item.kind === "lens" && item.lens ? <LensIcon lens={item.lens as LensNumber} size={44} /> : null}<span>{item.heading}</span>
            {settled ? <span className="lsm-signed rbk-settled" data-settled-mark><Check size={22} aria-hidden="true" /> {item.decision || "Confirmed"}</span> : null}</h2>
          <ol className="lsm-lines" ref={linesRef}>
            {rows.map(r => <li key={r.key} className={`lsm-line is-${r.state}${r.state === "gone" && leave ? " is-leaving" : ""}`} data-line={r.id} data-state={r.state}>
              <div className="lsm-line-in"><span key={r.rev} className="lsm-text"><Words parts={r.parts} text={r.text} leave={leave} /></span></div>
            </li>)}
          </ol>
          {item.more > 0 && <p className="lsm-more" data-more>{moreOnPhones(item.more)}</p>}
        </> : <p className="lsm-empty" role="status">{res.count === 0 ? "Nothing to confirm yet. The facilitator will load the items." : "The next item is coming up"}</p>}
      </section>
      <aside className={`lsm-side rbk-side is-${phase}`} aria-label="What the room says">
        <dl className="rbk-tally" aria-live="polite">
          <Bar label={yesText} n={shown.tally.yes} of={of} which="yes" />
          <Bar label={changeText} n={shown.tally.change} of={of} which="change" />
        </dl>
        <h3 className="rbk-missing-h">{missingText}</h3>
        <ul className="lsm-cards rbk-missing" ref={cardsRef} aria-label="What's missing, anonymous">
          {cards.map((c, i) => <li key={c.id} className={`lsm-card${i >= fit ? " is-out" : ""}`} aria-hidden={i >= fit ? true : undefined} data-missing><span className="rbk-clip">{c.text}</span></li>)}
        </ul>
        {further > 0 && <p className="lsm-more" data-more-missing>{moreOnPhones(further)}</p>}
      </aside>
    </div>
  </div>;
}

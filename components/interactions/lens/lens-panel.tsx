"use client";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import type { ControlItemsProps } from "@/components/interactions/control-items";
import { AiWallPanel } from "@/components/interactions/ai/ai-panel";
import { LensHeading } from "@/components/wayfinding/lens-icon";
import { lensOptions, seedCounts, seedLine, type SeedCount } from "@/lib/interactions/lens";
import "./lens.css";

// The seeding step on the control surface: counts only. The sentences stay hidden from the
// facilitator too, until each lens opens on Day 1.
export function SeedCounts({ room }: Pick<ControlItemsProps, "room">) {
  const engagement = room.show.context.id, names = room.show.context.lens_names ?? [];
  const [counts, setCounts] = useState<SeedCount[]>([]), [failed, setFailed] = useState(false);
  const version = room.frame?.version;
  useEffect(() => {
    let live = true;
    fetch(`/api/control/${engagement}/lens`, { cache: "no-store" }).then(r => r.json()).then(d => { if (live) { setCounts(seedCounts(d)); setFailed(false); } }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [engagement, version]);
  return <section className="ctl-items" aria-labelledby="lens-seed-title" data-lens-seed-counts>
    <div className="ctl-row is-between"><h2 id="lens-seed-title">Sentences waiting</h2><span className="ai-note"><Lock size={14} aria-hidden="true" />Counts only. The words stay hidden until each lens opens.</span></div>
    {counts.length ? <ul className="ai-rows">{counts.map(c => <li key={c.lens} data-lens-count={c.lens}>
      <span className="ai-row-n">{c.seeded}</span>
      <span className="ai-row-text"><span className="ai-row-title"><LensHeading lens={c.lens} names={names} size="small" /></span><span className="ai-row-sub">{seedLine(c)}</span></span>
    </li>)}</ul> : <p className="show-empty">{failed ? "Counts are not available right now." : "No sentences yet."}</p>}
  </section>;
}

// INT-12 on the control surface: counts for the seeding step, the AI groups for a lens wall.
export function LensPanel(props: ControlItemsProps) {
  const live = props.room.frame?.session;
  return lensOptions(live?.options).seed ? <SeedCounts room={props.room} /> : <AiWallPanel {...props} />;
}

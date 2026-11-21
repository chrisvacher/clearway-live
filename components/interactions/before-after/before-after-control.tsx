"use client";
import type { ControlItem } from "@/lib/control/types";
import { beforeAfterOptions, changeLabel, type BeforeAfterResults } from "@/lib/interactions/before-after";
export function BeforeAfterControl({ items, options, compact }: { items: ControlItem[]; options?: Record<string, unknown>; compact: boolean }) {
  const result = (items.find(i => i.key === "aggregate") as (ControlItem & { before_after?: BeforeAfterResults }) | undefined)?.before_after;
  const o = beforeAfterOptions(options);
  if (!result) return <p className="show-help">Waiting for answers.</p>;
  return <div className="ctl-private-scale" data-aggregate-only="true">
    <div className="ctl-row is-between">{(["before", "after"] as const).map(side => <div key={side}><strong>{result[side].average?.toFixed(1) ?? "·"}</strong><p>{side === "before" ? o.before_label : o.after_label} · {result[side].count} answers</p></div>)}</div>
    {o.show_change && <p>{changeLabel(result.change)}</p>}
    {!compact && (["before", "after"] as const).map(side => <div key={side}><p className="show-help">{side === "before" ? o.before_label : o.after_label}</p><ol className="ctl-private-columns" ref={el => { if (el) el.style.gridTemplateColumns = `repeat(${result.max}, minmax(0, 1fr))`; }}>{result[side].columns.map((count, i) => <li key={i}><span>{count}</span><div ref={el => { if (el) el.style.height = `${Math.max(3, count / Math.max(1, ...result[side].columns) * 100)}px`; }} /><b>{i + 1}</b></li>)}</ol></div>)}
  </div>;
}

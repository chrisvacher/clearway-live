"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AlignLeft, Check, ClipboardList, Cloud, Eye, Gauge, Grid2X2, ListChecks, ListOrdered, MessageCircleQuestion, Monitor, Send, Signature, Target, type LucideIcon } from "lucide-react";
import { PrivateTag } from "@/components/interactions/private-tag";
import { StepChip } from "@/components/ui/chips";
import { kindOf } from "@/lib/interactions/kinds";
import { partOpen } from "@/lib/run-of-show/self-paced";
import { parts, type ShowSession } from "@/lib/run-of-show/types";
import { formatPlannedTime } from "./planned-time";
import { SelfPacedList } from "./rehearsal";
import { useSecondTap, type Room } from "./live-controls";

const icons: Partial<Record<ShowSession["interaction"], LucideIcon>> = {
  word_cloud: Cloud, wall: AlignLeft, qa: MessageCircleQuestion, choice: ListChecks, scale: Gauge, ranking: ListOrdered,
  points: Target, grid: Grid2X2, form: ClipboardList, sign: Signature, goals: Target, lens: AlignLeft, four_lists: ListChecks,
};

function sectionRuns(steps: ShowSession[], part: string) {
  const sections: { name: string; steps: ShowSession[] }[] = [];
  for (const step of steps) {
    const name = step.section?.trim() || part;
    const previous = sections.at(-1);
    if (previous?.name === name) previous.steps.push(step);
    else sections.push({ name, steps: [step] });
  }
  return sections;
}

export function RunList({ room, preview, initialTimes, onPreview, onGoLive }: {
  room: Room;
  preview: ShowSession | null;
  initialTimes: Record<string, { starts: string | null; label: string }>;
  onPreview: (step: ShowSession) => void;
  onGoLive: (step: ShowSession) => void;
}) {
  const [expanded, setExpanded] = useState(false), [focusId, setFocusId] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const close = useSecondTap();
  const { show, frame, status, pending } = room;
  const context = show.context;
  const live = frame?.state.live_session_id ?? null;
  const steps = show.sessions.filter(step => step.mode === "live");
  const focused = steps.some(step => step.id === focusId) ? focusId : null;
  const entry = focused ?? preview?.id ?? steps[0]?.id;
  const activePart = room.current?.part ?? preview?.part ?? steps[0]?.part ?? "Day 1";
  const byPart = steps.filter(step => step.part === activePart);
  const selfPaced = (status?.self_paced ?? []).map(step => ({ ...step, mode: "self_paced" }));

  useEffect(() => {
    if (live) rows.current.get(live)?.scrollIntoView({ block: "nearest" });
  }, [live]);

  function key(event: KeyboardEvent<HTMLLIElement>, step: ShowSession) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const index = steps.findIndex(item => item.id === step.id);
      rows.current.get(steps[(index + (event.key === "ArrowDown" ? 1 : -1) + steps.length) % steps.length].id)?.focus();
    } else if (event.key === "Enter" && (event.target as Element).closest(".ctl-run-pick")) {
      event.preventDefault();
      if (!event.repeat && preview && preview.id !== live && preview.state !== "draft" && frame && !pending && !context.closed) onGoLive(preview);
    }
  }

  return <nav className={`ctl-col ctl-run${expanded ? "" : " is-folded"}`} aria-label="Run of show"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocusId(null); }}>
    <div className="ctl-run-heading">
      <h2>Run of show</h2>
      <span>{activePart} · {byPart.length} {byPart.length === 1 ? "step" : "steps"}</span>
      <button type="button" className="show-button is-small ctl-run-toggle" aria-expanded={expanded} aria-controls="ctl-run-body"
        onClick={() => setExpanded(value => !value)}>{expanded ? "Hide the run of show" : "Show the run of show"}</button>
    </div>
    <div id="ctl-run-body" className="ctl-run-body">
      {parts.map(part => {
        const sections = sectionRuns(steps.filter(step => step.part === part), part);
        const open = partOpen(part, [...steps, ...selfPaced], room.now + room.clockOffset);
        if (!sections.length && !open) return null;
        return <section key={part} className="ctl-part" aria-label={part}>
          {open && <div className="ctl-part-action"><button className="show-button is-small" disabled={Boolean(pending) || context.closed}
            onClick={() => close.tap(part, () => void room.press("close_part", { part }))}>{close.armed === part ? `Tap again to close ${part}` : `Close ${part}`}</button></div>}
          {sections.map(({ name, steps }, i) => <div key={`${name}-${i}`} className="ctl-run-section">
            <h3>{name}</h3>
            <ol className="ctl-run-list">{steps.map(step => {
              const isLive = step.id === live, isPreview = step.id === preview?.id;
              const state = isLive && frame?.session?.id === step.id ? frame.session.state : step.state;
              const done = state === "closed", Icon = done ? Check : icons[step.interaction] ?? Monitor;
              const statusName = done ? "stopped" : state === "draft" || state === "ready" ? "not_yet" : "open";
              const answers = (context.kinds?.find(kind => kind.kind === step.interaction) ?? kindOf(step))?.input ? status?.step_answers?.[step.id] ?? 0 : null;
              const blocked = !frame || Boolean(pending) || context.closed || isLive || state === "draft";
              const planned = initialTimes[step.id]?.starts === step.planned_start ? initialTimes[step.id].label : formatPlannedTime(step.planned_start, context.timezone);
              return <li key={step.id} data-session={step.id} onKeyDown={event => key(event, step)} className={`ctl-run-step${isLive ? " is-current" : isPreview ? " is-preview" : done ? " is-done" : ""}`}>
                <button type="button" className="ctl-run-pick" ref={node => { if (node) rows.current.set(step.id, node); else rows.current.delete(step.id); }}
                  tabIndex={entry === step.id ? 0 : -1} onFocus={() => setFocusId(step.id)} aria-pressed={isPreview}
                  aria-label={`Choose ${step.title}`} onClick={event => {
                    onPreview(step);
                    if (event.detail > 0) event.currentTarget.blur();
                  }} onDoubleClick={() => { if (!blocked) onGoLive(step); }}>
                  <time className="ctl-time" dateTime={step.planned_start ?? undefined} title={planned || undefined}>{planned.split(" ")[0]}</time>
                  <span className="ctl-state-icon" data-status={statusName} data-state={state} title={state === "closed" ? "Stopped" : statusName === "open" ? "Open for answers" : "Not yet shown"}><Icon size={done ? 14 : 16} aria-hidden="true" /></span>
                  <span className="ctl-run-title" title={step.title}>{step.title}</span>
                  <span className="ctl-run-summary">
                    <PrivateTag step={step} compact />
                    {isLive ? <StepChip state="live" compact /> : isPreview ? <StepChip state="preview" compact /> : answers !== null ? <span className="ctl-state-count" aria-label={`${answers} ${answers === 1 ? "answer" : "answers"}`}>{answers}</span> : null}
                  </span>
                </button>
                <span className="ctl-run-actions">
                  <button type="button" className="show-button is-small ctl-row-preview" aria-label={`Preview ${step.title}`} title="Preview" onClick={() => onPreview(step)}><Eye size={14} aria-hidden="true" /></button>
                  <button type="button" className="show-button is-small is-go" disabled={blocked} onClick={() => onGoLive(step)}
                    aria-label={`Go live with ${step.title}`}><Send size={14} aria-hidden="true" />Go live</button>
                </span>
              </li>;
            })}</ol>
          </div>)}
        </section>;
      })}
      <SelfPacedList room={room} timezone={context.timezone} />
      {!steps.length && !selfPaced.length && <p className="ctl-run-empty">No steps in the run of show.</p>}
    </div>
    <div className="ctl-run-hints" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> choose <span>·</span> <kbd>Space</kbd> preview <span>·</span> <kbd>↵</kbd> go live</div>
  </nav>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, LockKeyhole } from "lucide-react";
import { localTime, zonedInstant } from "@/lib/setup/policy";
import { fillYears } from "@/lib/run-of-show/policy";
import { defaultWindow, readyState } from "@/lib/run-of-show/builder";
import type { Part, SessionInput, ShowContext, ShowSession } from "@/lib/run-of-show/types";
import { contentOf, fallbackKinds, type InteractionKind, type KindInfo } from "@/lib/interactions/kinds";
import { kindDefaults, optionEditors } from "@/components/interactions/option-editors";
import { Button } from "@/components/ui/button";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { Select } from "@/components/ui/select";
import { contentPromptLabel } from "./content-options";
import { StepTimerField } from "./step-timer";
import { StepImageField } from "./step-image";
import { alwaysPrivate, canBePrivate, privateLine, visibilityLabels, visibilityOf, withVisibility, type Visibility } from "@/lib/interactions/visibility";

const stepTakesImage = (s: Pick<ShowSession, "interaction" | "options">) => s.interaction !== "content" || !["image", "loop", "screen_check"].includes(contentOf(s.options).screen);
const workshopKinds: InteractionKind[] = ["content", "video", "before_after", "word_cloud", "wall", "choice", "scale", "ranking", "points", "grid", "qa", "sign", "form"];
const tabs = [{ id: "content", label: "Content" }, { id: "settings", label: "Settings" }, { id: "notes", label: "Notes" }];

export type FormDraft = { value: ShowSession; start: string; opens: string; closes: string };

export function initialDraft(session: ShowSession, timezone: string): FormDraft {
  return { value: session, start: localTime(session.planned_start, timezone), opens: localTime(session.opens_at, timezone), closes: localTime(session.closes_at, timezone) };
}

export function sessionInput(draft: FormDraft, timezone: string, state: string): SessionInput {
  const { value, start, opens, closes } = draft;
  const instant = (local: string) => {
    try { return zonedInstant(local, timezone); }
    catch { throw new Error("Check the session times. During a daylight saving clock change, choose a different time."); }
  };
  return { ...value, state: readyState(value, state), planned_start: instant(start), opens_at: instant(opens), closes_at: instant(closes) };
}

type Props = { session: ShowSession; context: ShowContext; locked: boolean; workshop: boolean; saving: boolean;
  tab: string; onTab: (tab: string) => void; draft?: FormDraft; onDraft: (draft: FormDraft) => void;
  others: ShowSession[]; availableParts: readonly Part[]; startNote?: string;
  onDuplicate: () => void; onReady: (state: "draft" | "ready", draft: FormDraft) => void;
  onTeamLed: (value: boolean) => void;
};

export function SessionForm({ session, context, locked, workshop, saving, tab, onTab, draft,
  onDraft, others, availableParts, startNote, onDuplicate, onReady, onTeamLed }: Props) {
  const [value, setValue] = useState(() => draft?.value ?? session);
  const [start, setStart] = useState(() => draft?.start ?? localTime(session.planned_start, context.timezone));
  const [opens, setOpens] = useState(() => draft?.opens ?? localTime(session.opens_at, context.timezone));
  const [closes, setCloses] = useState(() => draft?.closes ?? localTime(session.closes_at, context.timezone));
  const last = useRef({ value, start, opens, closes });
  const report = useRef(onDraft);
  report.current = onDraft;
  useEffect(() => {
    const next = { value, start, opens, closes }, previous = last.current;
    if (previous.value === value && previous.start === start && previous.opens === opens && previous.closes === closes) return;
    last.current = next;
    report.current(next);
  }, [value, start, opens, closes]);

  useEffect(() => {
    if (draft) return;
    const next = initialDraft(session, context.timezone);
    last.current = next;
    setValue(next.value); setStart(next.start); setOpens(next.opens); setCloses(next.closes);
  }, [context.timezone, draft, session]);

  const change = <K extends keyof ShowSession>(key: K, next: ShowSession[K]) => setValue(previous => ({ ...previous, [key]: next }));
  const setting = <K extends keyof ShowSession["settings"]>(key: K, next: ShowSession["settings"][K]) =>
    setValue(previous => ({ ...previous, settings: { ...previous.settings, [key]: next } }));
  const seedable = others.filter(other => other.id !== session.id && other.interaction === value.interaction && other.seeded_from !== session.id);
  const running = !["draft", "ready"].includes(session.state);
  // A public step seeded from a private one would publish its answers: the database refuses the save, so say why here first.
  const seedSource = value.seeded_from ? others.find(other => other.id === value.seeded_from) : undefined;
  const seedBlocked = Boolean(seedSource && visibilityOf(seedSource) === "private" && visibilityOf(value) === "public");
  const kinds: KindInfo[] = context.kinds?.length ? context.kinds : Object.values(fallbackKinds);
  const availableKinds = workshop ? kinds.filter(kind => workshopKinds.includes(kind.kind) || session.interaction === kind.kind) : kinds;
  const kind = kinds.find(kind => kind.kind === value.interaction) ?? fallbackKinds[value.interaction];
  const Editor = optionEditors[value.interaction];
  const text = value.interaction === "word_cloud" || value.interaction === "wall";
  const choose = (next: InteractionKind) => {
    const info = kinds.find(kind => kind.kind === next), defaults = kindDefaults[next] ?? {};
    setValue(previous => ({ ...previous, interaction: next, options: {}, ...defaults,
      settings: { ...previous.settings, anonymous: info?.named === "always" ? false : info?.named === "never" ? true : previous.settings.anonymous } }));
  };
  const isDraft = session.state === "draft";
  const teamLed = Boolean(session.team_led);

  return <div className="show-panel rb-settings-form">
    <Tabs label="Step options" items={tabs} value={tab} onChange={onTab} />
    <fieldset disabled={locked} className="rb-settings-fields">
      <TabPanel id="content" active={tab === "content"}>
        <div className="show-fields">
          <label className="is-full" htmlFor="session-title">{value.interaction === "video" ? "Title on phones and in the run of show" : "Title in the run of show"}<input id="session-title" required maxLength={200} value={value.title} onChange={e => { const title = e.target.value; setValue(previous => { const { untitled: _u, ...options } = (previous.options ?? {}) as Record<string, unknown>; void _u; return { ...previous, title, options }; }); }} /></label>
          {value.interaction !== "video" && <label className="is-full" htmlFor="session-prompt">{value.interaction === "content" ? contentPromptLabel[contentOf(value.options).screen] : value.interaction === "before_after" ? "Headline on the TV" : "Question on the TV and phones"}<textarea id="session-prompt" maxLength={4000} rows={4} value={value.prompt} onChange={e => change("prompt", e.target.value)} /></label>}
          {!workshop && <p className="show-help is-full">Use {"{base year + 10}"}, {"{base year + 3}"} or {"{base year + 1}"} to fill in the year.</p>}
          {!workshop && value.prompt.includes("{base year") && <div className="show-preview is-full"><span className="show-help">Prompt preview</span><p>{fillYears(value.prompt, context.base_year)}</p></div>}
          <label className="is-full" htmlFor="session-interaction">Interaction<Select id="session-interaction" disabled={running} value={value.interaction} onChange={e => choose(e.target.value as InteractionKind)}>
            {availableKinds.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
            {!kinds.some(k => k.kind === value.interaction) && <option value={value.interaction}>{value.interaction}</option>}</Select></label>
          {seedable.length > 0 && <label className="is-full" htmlFor="session-seeded">Seeded from<Select id="session-seeded" value={value.seeded_from ?? ""} onChange={e => change("seeded_from", e.target.value || null)}>
            <option value="">Nothing, start empty</option>{seedable.map(s => <option key={s.id} value={s.id}>{s.part}: {s.title}</option>)}</Select>
            <span className="show-help">{seedBlocked ? "That step is for the facilitators only, so this step can’t start from its answers while it shows answers to everyone. Choose Facilitators only in Settings, or pick another step."
              : "Starts this step from the earlier step’s answers, so the room does not begin from nothing."}</span></label>}
          {Editor && <Editor session={session} value={value.options ?? {}} context={context} fresh={false} locked={locked} reorderOptions onChange={options => change("options", options)} setPrompt={prompt => change("prompt", prompt)} />}
          {stepTakesImage(value) && <><h3 className="is-full show-group">Image beside the question</h3>
            <StepImageField engagement={context.id} value={value.options ?? {}} canFill={value.interaction === "content"} locked={locked} onChange={options => change("options", options)} /></>}
        </div>
      </TabPanel>
      <TabPanel id="settings" active={tab === "settings"}>
        <div className="show-fields">
          <label htmlFor="session-section">Section<input id="session-section" maxLength={100} list="session-sections" value={value.section ?? ""} onChange={e => change("section", e.target.value)} />
            <datalist id="session-sections">{[...new Set(others.filter(s => s.part === value.part).map(s => (s.section ?? "").trim()).filter(Boolean))].map(name => <option key={name} value={name} />)}</datalist>
            <span className="show-help">The named group it sits in on the run of show. Leave it empty for none.</span></label>
          <label htmlFor="session-part">Part<Select id="session-part" value={value.part} onChange={e => change("part", e.target.value as ShowSession["part"])}>{availableParts.map(part => <option key={part}>{part}</option>)}</Select></label>
          <label htmlFor="session-mode">Mode<Select id="session-mode" disabled={running} value={value.mode} onChange={e => { const mode = e.target.value as ShowSession["mode"]; change("mode", mode); if (mode === "self_paced" && !opens && !closes) { const w = defaultWindow(Date.now()); setOpens(localTime(w.opens_at, context.timezone)); setCloses(localTime(w.closes_at, context.timezone)); } }}><option value="live">Live in the room</option><option value="self_paced">Self-paced</option></Select></label>
          {startNote !== undefined ? <p className="show-help" id="session-start">{startNote}</p> : <label htmlFor="session-start">Planned start<input id="session-start" type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></label>}
          <label htmlFor="session-length">Length in minutes<input id="session-length" type="number" min={1} max={1440} required value={value.planned_minutes} onChange={e => change("planned_minutes", Number(e.target.value))} /></label>
          {value.mode === "self_paced" && <><label htmlFor="session-opens">Opens<input id="session-opens" type="datetime-local" required value={opens} onChange={e => setOpens(e.target.value)} /></label><label htmlFor="session-closes">Closes<input id="session-closes" type="datetime-local" required value={closes} onChange={e => setCloses(e.target.value)} /></label><p className="show-help is-full">It opens and closes on phones at these times, outside the live room. Next and Back skip it, and invite emails link to it.</p></>}
          <h3 className="is-full show-group">Timer</h3>
          <StepTimerField session={value} others={others} value={value.options ?? {}} locked={locked} onChange={options => change("options", options)} />
          {kind?.input && canBePrivate(value.interaction) && <label className="is-full" htmlFor="session-visibility">Who sees answers
            <Select id="session-visibility" disabled={alwaysPrivate(value.interaction)} value={visibilityOf(value)}
              onChange={e => change("options", withVisibility(value.options, e.target.value as Visibility))}>
              {(["public", "private"] as const).map(v => <option key={v} value={v}>{visibilityLabels[v]}</option>)}</Select>
            <span className="show-help">{alwaysPrivate(value.interaction) ? "A private form is always for the facilitators only."
              : visibilityOf(value) === "private" ? `The TV and phones show the question and how many have answered, never the answers. Phones read: “${privateLine}” Results, the CSV and the recap show every answer, marked Private.`
              : "Answers show on the TV and on phones. You can change this while the step is live."}</span></label>}
          {kind?.input && <>
            {kind.named === "setting" ? <label className="show-check is-full" htmlFor="session-anonymous"><input id="session-anonymous" type="checkbox" checked={value.settings.anonymous} onChange={e => setting("anonymous", e.target.checked)} />Anonymous on the screen</label>
              : <p className="show-help is-full">{kind.named === "always" ? "Named by design: names show on the screen." : "Answers are anonymous on the screen."}</p>}
            <label className="show-check is-full" htmlFor="session-join"><input id="session-join" type="checkbox" checked={value.settings.join_strip} onChange={e => setting("join_strip", e.target.checked)} />Show the join strip on the TV</label>
            <label htmlFor="session-burst">Burst length<Select id="session-burst" value={value.settings.burst_minutes} onChange={e => setting("burst_minutes", Number(e.target.value))}>{[3, 4, 5].map(n => <option key={n} value={n}>{n} minutes</option>)}</Select></label>
            {!kind.one_per_person && <label htmlFor="session-sends">Answers per person<input id="session-sends" type="number" min={1} max={100} required value={value.max_sends} onChange={e => change("max_sends", Number(e.target.value))} /></label>}
            {text && <><label htmlFor="session-characters">Characters per answer<input id="session-characters" type="number" min={1} max={280} required value={value.max_characters} onChange={e => change("max_characters", Number(e.target.value))} /></label>
              <label htmlFor="session-words">Words per answer<input id="session-words" type="number" min={1} max={50} required value={value.max_words} onChange={e => change("max_words", Number(e.target.value))} /></label></>}
          </>}
          <label className="is-full" htmlFor="session-depth">Phone depth<textarea id="session-depth" maxLength={20000} rows={4} value={value.phone_depth} onChange={e => change("phone_depth", e.target.value)} /><span className="show-help">Detail, sources or Scripture for phones only.</span></label>
          {!workshop && <>
          <label className="is-full" htmlFor="session-segment">Segment<input id="session-segment" maxLength={100} value={value.segment ?? ""} onChange={e => change("segment", e.target.value)} /><span className="show-help">Steps in the same segment, like Five Lenses, keep taking answers until the room moves on from the segment.</span></label>
          <label className="is-full" htmlFor="session-lands">Lands in<input id="session-lands" maxLength={200} value={value.lands_in} onChange={e => change("lands_in", e.target.value)} /></label>
          <label className="show-check is-full" htmlFor="session-team-led"><input id="session-team-led" type="checkbox" checked={teamLed} disabled={saving || context.closed} onChange={e => onTeamLed(e.target.checked)} />Team-led step: turn the scribe console off while this step is live</label>
          </>}
        </div>
      </TabPanel>
      <TabPanel id="notes" active={tab === "notes"}>
        <div className="show-fields">
          <label className="is-full" htmlFor="session-notes"><span><LockKeyhole size={15} aria-hidden="true" /> Presenter notes</span><textarea id="session-notes" maxLength={30000} rows={5} value={value.notes} onChange={e => change("notes", e.target.value)} /><span className="show-help">Only facilitators see these. They never reach the TV or phones.</span></label>
        </div>
      </TabPanel>
    </fieldset>
    <div className="show-panel-foot rb-settings-foot">
      <Button size="small" disabled={locked || saving} onClick={onDuplicate}><Copy />Duplicate</Button>
      <Button size="small" variant={isDraft ? "primary" : "secondary"} disabled={locked || saving || running}
        onClick={() => onReady(isDraft ? "ready" : "draft", { value, start, opens, closes })}>
        {isDraft && <Check />}{isDraft ? "Mark ready" : "Mark as draft"}
      </Button>
    </div>
  </div>;
}

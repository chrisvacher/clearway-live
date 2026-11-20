"use client";

import { useState } from "react";
import { Lock, Send } from "lucide-react";
import { previewFrame } from "@/components/control/use-preview";
import { phoneInputs } from "@/components/interactions/phone-inputs";
import { PhoneContent } from "@/components/room/phone-content";
import { TvMirror } from "@/components/tv/tv-mirror";
import { brandFor, skinOf } from "@/lib/brand";
import { phoneTheme } from "@/lib/brand/screens";
import { kindOf } from "@/lib/interactions/kinds";
import { isPrivateStep, privateLine } from "@/lib/interactions/visibility";
import type { LiveSession, LiveSnapshot } from "@/lib/live/types";
import type { PhoneStep } from "@/lib/phone/types";
import { fillYears } from "@/lib/run-of-show/policy";
import { sampleAnswers } from "@/lib/run-of-show/sample-answers";
import type { ShowContext, ShowSession } from "@/lib/run-of-show/types";
import type { TvAppearance } from "@/lib/tv/types";

const noop = () => {};
const sampleTime = "2026-11-19T12:00:00Z";

function phoneStep(step: ShowSession, context: ShowContext): PhoneStep & LiveSession {
  return { ...step, state: "open", closed_at: null, prompt: fillYears(step.prompt, context.base_year),
    phone_depth: fillYears(step.phone_depth, context.base_year), kind: context.kinds?.find(kind => kind.kind === step.interaction) };
}

function sampleFrame(step: PhoneStep & LiveSession, display: TvAppearance, engagement: string): LiveSnapshot {
  // Facilitators only: the TV and phones would receive counts only, so the preview draws from counts only too.
  const sample = sampleAnswers(step), hidden = isPrivateStep(step);
  const results = hidden ? { total: sample.results.total, people: sample.results.people, words: [] } : sample.results, answers = hidden ? [] : sample.answers;
  const base: LiveSnapshot = {
    status: "ok", role: "facilitator", version: 0, server_time: sampleTime, topic: "", answers: [], next: null,
    phone_depth: null, display, session: null, state: { engagement_id: engagement, live_session_id: null, version: 0,
      tv_content: "holding", phones_down: false, burst_ends_at: null, results },
  };
  return previewFrame(base, { status: "ok", server_time: sampleTime, session: step, hidden_keys: [], hidden_ids: [], results, answers });
}

const views = ["TV and phone", "TV", "Phone"] as const;

export function StepPreview({ step, context, display }: { step: ShowSession | undefined; context: ShowContext; display: TvAppearance }) {
  const [view, setView] = useState<typeof views[number]>("TV and phone");
  const skin = skinOf(display.skin);
  const phone = step && phoneStep(step, context);
  const frame = phone && sampleFrame(phone, display, context.id);
  const kind = kindOf(phone ?? null);
  const Input = phone && phoneInputs[phone.interaction];

  return <section className="rb-preview" aria-label="Step preview">
    <div className="rb-preview-head">
      <h2>Preview</h2><span className="rb-brand">{brandFor(skin).label}</span>
      {kind?.input && <span className="show-muted">Sample answers</span>}
      <div className="rb-mode rb-preview-mode" role="group" aria-label="Preview surfaces">
        {views.map(label => <button key={label} type="button" aria-pressed={label === view} className={label === view ? "is-on" : ""} onClick={() => setView(label)}>{label}</button>)}
      </div>
    </div>
    {phone && frame ? <div className="rb-preview-displays">
      {view !== "Phone" && <div className="rb-preview-tv"><TvMirror frame={frame} label="TV preview" /></div>}
      {view !== "TV" && <div className="rb-preview-phone" data-surface="phone" data-theme={phoneTheme[skin]} data-skin={skin} data-motion="reduced" aria-label={`Phone preview: ${phone.title}`}>
        <div className="rb-preview-phone-inner" inert>
          {phone.interaction === "content" ? <PhoneContent step={phone} /> : <>
            <h3 className="ph-headline">{phone.prompt || phone.title}</h3>
            {isPrivateStep(phone) && <p className="ph-who" data-private-line><span className="ph-marker"><Lock size={14} aria-hidden="true" />Private</span><span><strong>Who sees my answers?</strong> {privateLine}</span></p>}
            {Input ? <Input step={phone} mine={[]} open frame={frame} send={noop} change={noop} withdraw={noop} />
              : kind?.input && <div className="rb-phone-example"><textarea className="ph-input" aria-label="Your answer" placeholder="Type your answer" /><button className="ph-send" type="button"><Send size={18} aria-hidden="true" />Send</button></div>}
          </>}
        </div>
      </div>}
    </div> : <p className="rb-preview-empty">Select a step to preview it.</p>}
  </section>;
}

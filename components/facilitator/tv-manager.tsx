"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Monitor, MonitorCheck } from "lucide-react";
import { OpenTvWindow } from "@/components/control/open-tv-window";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { Field, SettingsCard, SettingsSection } from "@/components/ui/settings";
import { useToast } from "@/components/ui/toast";
import { skinOf } from "@/lib/brand";
import type { HomeList } from "@/lib/images/home";
import { pairingCode } from "@/lib/tv/policy";
import type { PairedScreen, TvAppearance, TvManagerData } from "@/lib/tv/types";
import { HomeCard } from "./home-card";
import { TvSizeControl } from "./tv-size-control";

type DisplayField = "room_size" | "theme" | "texture" | "reduced_motion";
type DisplaySettings = Pick<TvAppearance, DisplayField>;
type Feedback = { action: string; text: string; error?: true };

const skins = {
  clearway: { dark: "Navy", light: "Off-White" },
  novetera: { dark: "Charcoal", light: "Chalk" },
};

const displayFields = {
  room_size: "Type size on the TV",
  theme: "TV theme",
  texture: "Clearway texture",
  reduced_motion: "Reduce motion on the TV",
} as const;

const failures: Record<string, string> = {
  invalid_code: "That code couldn’t be used. Check the code on the TV and try again.",
  limited: "Please wait a few minutes before trying another code.",
  running: "A session is live. Use the room controls to change what’s showing.",
  closed: "This engagement has closed.",
};

async function readScreens(endpoint: string): Promise<TvManagerData> {
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) throw new Error("We couldn’t reach the room. Please try again.");
  const result = await response.json();
  if (result.status !== "ok") throw new Error(failures[result.status] ?? "We couldn’t load the screens.");
  return result;
}

function switchLabel(id: string, name: string, checked: boolean, disabled: boolean, onChange: () => void) {
  return <div className="cwl-c-switch-row cwl-c-switch-setting">
    <button id={id} type="button" className="cwl-c-switch" role="switch" aria-checked={checked} aria-labelledby={`${id}-label`}
      disabled={disabled} onClick={onChange} />
    <label id={`${id}-label`} htmlFor={id}>{name}</label>
  </div>;
}

export function TvManager({ id, initial, home, tvAddress }: { id: string; initial: TvManagerData; home: HomeList | null; tvAddress: string }) {
  const [data, setData] = useState(initial);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("Front TV");
  const [pending, setPending] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [unpair, setUnpair] = useState<PairedScreen | null>(null);
  const requestInProgress = useRef(false);
  const revision = useRef(0);
  const field = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const endpoint = `/api/tv/control/${id}`;
  const brand = skinOf(data.display.skin);
  const themeNames = skins[brand];
  const display = data.display;
  const busy = Boolean(pending);
  const disabled = busy || data.closed;

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const startedAt = revision.current;
      try {
        if (requestInProgress.current || document.visibilityState === "hidden") return;
        const current = await readScreens(endpoint);
        if (!stopped && revision.current === startedAt && !requestInProgress.current) setData(current);
      } catch { /* Keep the last screen list. */ }
      finally { if (!stopped) timer = setTimeout(() => void poll(), 5000); }
    }
    timer = setTimeout(() => void poll(), 5000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [endpoint]);

  async function perform(action: string, task: () => Promise<void>) {
    if (requestInProgress.current || data.closed) return false;
    requestInProgress.current = true;
    revision.current++;
    setPending(action);
    setFeedback(null);
    try { await task(); return true; }
    catch (error) {
      setFeedback({ action, error: true, text: error instanceof Error ? error.message : "We couldn’t reach the room. Please try again." });
      return false;
    } finally { requestInProgress.current = false; setPending(""); }
  }

  async function write(action: string, values: Record<string, unknown>) {
    const response = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...values }),
    });
    const result = await response.json();
    if (!response.ok || result.status !== "ok") throw new Error(failures[result.status] ?? "We couldn’t save that. Please try again.");
  }

  function change(action: "pair" | "unpair" | "screen", values: Record<string, unknown>) {
    return perform(action, async () => {
      await write(action, values);
      if (action === "pair") { setCode(""); field.current?.focus(); }
      if (action === "unpair") setUnpair(null);
      setFeedback({
        action, text: action === "pair" ? "TV paired. The screen will join automatically." : action === "unpair" ? "TV unpaired." : "TV view changed.",
      });
      try { setData(await readScreens(endpoint)); } catch { /* The change succeeded. The next poll refreshes the list. */ }
    });
  }

  function setDisplay<K extends DisplayField>(key: K, value: DisplaySettings[K]) {
    void perform("display", async () => {
      let current = data;
      setData({ ...current, display: { ...current.display, [key]: value } });
      let before: DisplaySettings[K];
      try {
        current = await readScreens(endpoint);
        before = current.display[key];
        if (before === value) { setData(current); return; }
        setData(await updateDisplay(current, key, value));
      } catch (cause) {
        setData(current);
        throw cause;
      }
      toast(`${displayFields[key]} changed`, {
        action: { label: "Undo", onClick: async () => {
          const undone = await perform("display", async () => {
            const latest = await readScreens(endpoint);
            if (latest.display[key] === value) setData(await updateDisplay(latest, key, before));
            else setData(latest);
          });
          if (!undone) throw new Error("We couldn’t undo that change.");
        } },
      });
    });
  }

  async function updateDisplay<K extends DisplayField>(state: TvManagerData, key: K, value: DisplaySettings[K]) {
    const { room_size, theme, texture, reduced_motion } = state.display;
    await write("display", { room_size, theme, texture, reduced_motion, [key]: value });
    return { ...state, display: { ...state.display, [key]: value } };
  }

  const seen = (at: string) => {
    const minutes = Math.max(0, Math.floor((Date.parse(data.server_time) - Date.parse(at)) / 60000));
    return minutes < 1 ? "Last seen just now" : `Last seen ${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  };
  const pair = (event: FormEvent) => {
    event.preventDefault();
    void change("pair", { code: pairingCode(code), label });
  };
  const said = (action: string) => feedback?.action === action
    ? <p className={`cwl-c-feedback${feedback.error ? " is-error" : ""}`} role={feedback.error ? "alert" : "status"}>{feedback.text}</p>
    : null;

  return <>
    <PageHeader title="Screens" lead={<>Open the TV in a new window on this computer, then drag it to the room&apos;s screen or share it. Using a separate computer at the screen? Open <a className="text-link" href={tvAddress} target="_blank" rel="noreferrer">{new URL(tvAddress).host}/tv</a> there and enter its code below.</>} />
    <div className="cwl-c-screens-stack">
      <SettingsCard>
        <SettingsSection title="Connect a screen" description="You can pair more than one screen. Pairing lasts until this engagement closes.">
          <form className="cwl-c-pair cwl-ui-field is-wide" onSubmit={pair}>
            <div className="cwl-c-screen-actions"><OpenTvWindow id={id} primary disabled={data.closed} /></div>
            <Field label="Code on the TV">
              <input ref={field} className="tv-manager-code" inputMode="numeric" autoComplete="off" maxLength={7} value={code}
                onChange={event => setCode(event.target.value.replace(/[^0-9 ]/g, ""))} required />
            </Field>
            <Field label="Name this screen">
              <input maxLength={80} value={label} onChange={event => setLabel(event.target.value)} required />
            </Field>
            <div className="cwl-c-screen-actions">
              <Button type="submit" disabled={disabled || !pairingCode(code) || !label.trim()}>
                <MonitorCheck size={16} aria-hidden="true" />{pending === "pair" ? "Pairing…" : "Pair this TV"}
              </Button>
              {said("pair")}
            </div>
          </form>
        </SettingsSection>
        <SettingsSection title="Paired screens">
          <div className="cwl-ui-field is-wide">
            {data.screens.length ? <ul className="tv-screen-list">{data.screens.map(screen => <li key={screen.id}>
              <Monitor size={20} aria-hidden="true" /><div><strong>{screen.label}</strong><p>{screen.browser}</p>
                <p className="tv-screens-help">{screen.last_seen_at ? seen(screen.last_seen_at) : "Waiting for the screen to join"}</p></div>
              <Button size="small" disabled={disabled} onClick={() => setUnpair(screen)}>Unpair</Button>
            </li>)}</ul> : <p>No screens paired yet.</p>}
            {said("unpair")}
          </div>
        </SettingsSection>
        <SettingsSection title="Prepare the screen" description="These views appear on every paired TV.">
          <div className="cwl-c-screen-actions">
            {[["join", "Show join screen"], ["screen_check", "Show screen check"], ["holding", "Show holding screen"]].map(([content, title]) =>
              <Button key={content} aria-pressed={data.tv_content === content} disabled={disabled} onClick={() => void change("screen", { content })}>{title}</Button>)}
          </div>
          {said("screen")}
        </SettingsSection>
      </SettingsCard>
      {home && <HomeCard id={id} initial={home} closed={data.closed} />}
      <SettingsCard>
        <SettingsSection title="Display settings">
          <div className="cwl-ui-field is-wide">
            <strong className="cwl-c-field-title">Type size on the TV</strong>
            <TvSizeControl value={display.room_size} disabled={disabled} onChange={value => setDisplay("room_size", value)} />
            <p className="cwl-ui-field-help">Largest suits a U-shape of about 8 on a small TV.</p>
          </div>
          <fieldset className="cwl-c-choice-group cwl-c-tv-theme" disabled={disabled} aria-describedby="tv-theme-help">
            <legend>TV theme</legend>
            <div className="cwl-c-radio-pair">
              {(["dark", "light"] as const).map(theme => <label className="cwl-c-radio-card" key={theme}>
                <input type="radio" name="tv-theme" checked={display.theme === theme} onChange={() => setDisplay("theme", theme)} />
                {themeNames[theme]}<Check size={16} aria-hidden="true" />
              </label>)}
            </div>
            <p className="cwl-ui-field-help" id="tv-theme-help">The choices follow the engagement&apos;s brand.</p>
          </fieldset>
          {switchLabel("tv-motion", "Reduce motion on the TV", display.reduced_motion, disabled, () => setDisplay("reduced_motion", !display.reduced_motion))}
          {brand === "clearway" && switchLabel("tv-texture", "Show the Clearway texture", display.texture, disabled, () => setDisplay("texture", !display.texture))}
          {said("display")}
        </SettingsSection>
      </SettingsCard>
    </div>
    <ConfirmDialog open={Boolean(unpair)} title={`Unpair ${unpair?.label ?? "this screen"}?`} busy={pending === "unpair"} confirmLabel="Unpair"
      description={<>It will show a new code for pairing again.{feedback?.action === "unpair" && feedback.error && <p role="alert">{feedback.text}</p>}</>}
      onCancel={() => setUnpair(null)} onConfirm={() => { if (unpair) void change("unpair", { device: unpair.id }); }} />
  </>;
}

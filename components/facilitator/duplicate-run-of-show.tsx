"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Copy, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

type Summary = { id: string; title: string; church: string; date: string | null; steps: number; sections: number; has_answers: boolean; live: boolean };
type Options = { source: Summary; targets: Summary[] };
const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const formatDate = (value: string | null) => value ? date.format(new Date(value)) : "No date";
const amount = (number: number, noun: string) => `${number} ${noun}${number === 1 ? "" : "s"}`;
const targetLine = (item: Summary) => `${item.title} · ${item.church} · ${formatDate(item.date)}`;
const failed = "Couldn’t duplicate the run of show. Try again.";

export function DuplicateRunOfShow({ source, onClose }: { source: string; onClose: () => void }) {
  const title = useId(), router = useRouter(), toast = useToast();
  const [options, setOptions] = useState<Options>();
  const [target, setTarget] = useState<Summary>();
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(false);
  const [replace, setReplace] = useState(false);
  const [flags, setFlags] = useState({ media: true, times: true, visibility: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/setup/duplicate-run-of-show?source=${source}`, { signal: abort.signal });
        if (!response.ok) throw new Error();
        setOptions(await response.json() as Options);
      } catch {
        if (!abort.signal.aborted) setError("Couldn’t load engagements. Try opening this dialog again.");
      }
    })();
    return () => abort.abort();
  }, [source]);

  const matches = options?.targets.filter(item => targetLine(item).toLowerCase().includes(query.trim().toLowerCase())) ?? [];
  function choose(item: Summary) {
    setTarget(item); setQuery(targetLine(item)); setPicking(false); setReplace(false); setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!target || target.live || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/setup/duplicate-run-of-show", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, target: target.id, replace, ...flags }),
      });
      const result = await response.json() as { status: string; copied?: number; title?: string; id?: string; message?: string };
      if (!response.ok || result.status !== "ok") throw new Error(result.message ?? failed);
      toast(`Copied ${amount(result.copied ?? 0, "step")} to ${result.title ?? target.title}`, {
        action: { label: "Open its run of show", href: `/admin/${result.id ?? target.id}/run-of-show` },
      });
      onClose();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : failed);
    } finally {
      setSaving(false);
    }
  }

  return <Dialog open labelledBy={title} className="eng-duplicate-dialog" onClose={() => { if (!saving) onClose(); }}>
    <header>
      <h2 id={title}>Duplicate run of show</h2>
      <Button variant="quiet" iconOnly aria-label="Close" disabled={saving} onClick={onClose}><X aria-hidden="true" /></Button>
    </header>
    <form onSubmit={event => void submit(event)}>
      <div className="eng-duplicate-body">
        {options ? <>
          <div className="eng-duplicate-source">
            <span>From</span><strong>{options.source.title}</strong>
            <small>{options.source.church} · {formatDate(options.source.date)} · {amount(options.source.steps, "step")} in {amount(options.source.sections, "section")}</small>
          </div>
          <div className="eng-duplicate-picker">
            <label>To
              <span className="eng-duplicate-search">
                <Search size={16} aria-hidden="true" />
                <input type="search" data-initial-focus value={query} placeholder="Search engagements" autoComplete="off" disabled={saving}
                  onFocus={event => { if (target) event.currentTarget.select(); setPicking(true); }}
                  onChange={event => { setQuery(event.target.value); setTarget(undefined); setPicking(true); }}
                  onKeyDown={event => {
                    if (event.key === "Escape" && picking) { event.preventDefault(); setPicking(false); }
                    if (event.key === "Enter" && picking && matches.length === 1) { event.preventDefault(); choose(matches[0]); }
                  }} />
              </span>
            </label>
            {picking && <ul aria-label="Matching engagements">
              {matches.map(item => <li key={item.id}><button type="button" onClick={() => choose(item)}>{targetLine(item)}</button></li>)}
              {!matches.length && <li>No matching engagements</li>}
            </ul>}
          </div>
          {target?.live && <p role="status">Duplicate after the workshop ends, or into another engagement.</p>}
          {!!target?.steps && <fieldset>
            <legend>It already has {amount(target.steps, "step")}</legend>
            <label className="eng-duplicate-choice">
              <input type="radio" name="method" checked={replace} disabled={target.has_answers || saving} onChange={() => setReplace(true)} />
              <span>Replace them<small>{target.has_answers ? "Unavailable because these steps already have answers."
                : `Removes its ${amount(target.steps, "step")}. Not offered when any of them already has answers.`}</small></span>
            </label>
            <label className="eng-duplicate-choice">
              <input type="radio" name="method" checked={!replace} disabled={saving} onChange={() => setReplace(false)} />
              <span>Add after them<small>The copied steps go at the end, in their sections.</small></span>
            </label>
          </fieldset>}
          <fieldset>
            <legend>Bring along</legend>
            {([["media", "Images and videos"], ["times", "Timers and planned times"], ["visibility", "Who sees answers on each step"]] as const).map(([key, label]) =>
              <label className="eng-duplicate-check" key={key}><input type="checkbox" checked={flags[key]} disabled={saving}
                onChange={event => setFlags({ ...flags, [key]: event.target.checked })} />{label}</label>)}
          </fieldset>
          <p>Answers never copy. Times move to the new date, keeping the same start. The new engagement keeps its own brand, so these steps show in Novetera if it&apos;s set to Novetera.</p>
        </> : !error && <p role="status">Loading engagements…</p>}
        {error && <p role="alert">{error}</p>}
      </div>
      <footer>
        <Button variant="quiet" disabled={saving} onClick={onClose}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={!target || target.live || saving || !options?.source.steps}>
          <Copy aria-hidden="true" />{saving ? "Copying…" : options ? `Duplicate ${amount(options.source.steps, "step")}` : "Duplicate steps"}
        </Button>
      </footer>
    </form>
  </Dialog>;
}

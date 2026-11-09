"use client";
import { Radio, Users, WifiOff } from "lucide-react";
import { ScribeCard } from "./scribe-card";
import { CaptureComposer } from "./capture-composer";
import { CorrectionComposer } from "./correction-composer";
import { useArrivals } from "./use-arrivals";
import type { useScribe } from "./use-scribe";
import "./scribe.css";

type Scribe = ReturnType<typeof useScribe>;

// SCR-01: the scribe console on a laptop. The header follows the run of show; cards attach to the
// step that is live. A team-led step turns the console off, and nothing live says so.
export function ScribeConsole({ engagement, church, scribe }: { engagement: string; church: string; scribe: Scribe }) {
  const { state, mode, cards, files, online, waiting, capture, edit, refile, dismiss, addFiles, fileError, readBack, correct } = scribe;
  const live = state?.live ?? null;
  const sessions = state?.sessions ?? [];
  const title = (id: string) => sessions.find(s => s.id === id)?.title;
  const shownCards = cards.filter(c => live ? c.session_id === live.id : true);
  const shownFiles = files.filter(f => live ? f.session_id === live.id : true);
  const photos = shownFiles.filter(f => f.kind === "photo"), others = shownFiles.filter(f => f.kind === "file");
  const fresh = useArrivals([...cards.map(c => c.id), ...files.map(f => f.id)]);
  const off = mode === "team_led" || mode === "nothing";

  return <div className="scr-app" data-testid="scribe-console">
    <header className="scr-head">
      <div className="scr-session grow">
        <span className="scr-eyebrow">{church} · Scribe</span>
        <b>{live ? live.title : "Nothing is live"}</b>
        {live?.part ? <span className="scr-muted">{live.part}</span> : null}
      </div>
      <span className="scr-follow"><Radio className="scr-icon" aria-hidden="true" />{live ? "Following the run of show" : "Waiting for the next step"}</span>
    </header>
    {waiting > 0 || !online ? <div className="scr-queue" role="status" data-testid="scribe-queue">
      <WifiOff className="scr-icon" aria-hidden="true" />
      <span>{online ? "Sending what is saved on this laptop, in order." : "No connection. Cards are saved on this laptop and will send in order when it is back."}</span>
      <span className="n" aria-label={`${waiting} waiting`}>{waiting}</span>
    </div> : null}
    <div className="scr-body">
      <section className="scr-col" aria-label="Capture">
        <CaptureComposer sessionTitle={live && !live.team_led ? live.title : null} off={off} onCapture={capture} onFiles={files => void addFiles(files)} fileError={fileError} />
        {readBack?.session && !off ? <CorrectionComposer read={readBack} onSend={correct} /> : null}
      </section>
      <section className="scr-col is-cards" aria-label="Cards for this step">
        <div className="scr-colhead"><span className="scr-label">Cards{live ? ` · ${live.title}` : ""}</span><span className="scr-muted">{shownCards.length} {shownCards.length === 1 ? "card" : "cards"}</span></div>
        <div className="scr-list" role="list" data-testid="scribe-cards">
          {shownCards.length === 0 ? <div className="scr-empty">Nothing captured for this step yet.</div> : null}
          {shownCards.map(card => <div role="listitem" key={card.id}>
            <ScribeCard card={card} engagement={engagement} surface="console" sessions={sessions} sessionTitle={title(card.session_id)} isNew={fresh.has(card.id)}
              onEdit={(c, next) => edit(c, next)} onRefile={refile} onDismiss={dismiss} />
          </div>)}
        </div>
      </section>
      <section className="scr-col is-photos" aria-label="Photos and files">
        <div className="scr-colhead"><span className="scr-label">Photos and files</span><span className="scr-muted">{shownFiles.length}</span></div>
        <div className="scr-strip" data-testid="scribe-files">
          {photos.length === 0 && others.length === 0 ? <div className="scr-empty">Easel photos from the scribe’s phone land here.</div> : null}
          {photos.map(file => <figure key={file.id} className={`${fresh.has(file.id) ? "is-new " : ""}${file.state === "failed" ? "is-failed" : file.uploaded ? "" : "is-arriving"}`}>
            <ScribeCard file={file} engagement={engagement} surface="console" sessions={sessions} onRefile={refile} onDismiss={dismiss} />
          </figure>)}
          {others.map(file => <ScribeCard key={file.id} file={file} engagement={engagement} surface="console" sessions={sessions} onRefile={refile} onDismiss={dismiss} isNew={fresh.has(file.id)} />)}
        </div>
      </section>
    </div>
    {mode === "team_led" ? <div className="scr-off" role="status" data-testid="scribe-off"><div className="scr-off-card">
      <span className="disc"><Users className="scr-icon" aria-hidden="true" /></span><h3>The team has the room</h3>
      <p>The team is leading this step, so capture is off. It comes back when the run of show moves on.</p></div></div> : null}
    {mode === "nothing" ? <div className="scr-off" role="status" data-testid="scribe-nothing"><div className="scr-off-card">
      <h3>Nothing is live yet</h3><p>Capture starts when the facilitator opens a step. Cards attach to the step that is live.</p></div></div> : null}
    {mode === "signed_out" ? <div className="scr-off" role="alert"><div className="scr-off-card"><h3>Sign in again</h3><p>This device is not signed in as the scribe. Ask the facilitator to let you back in.</p></div></div> : null}
  </div>;
}

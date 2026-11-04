import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, BookOpen, ChartPie, Cloud, Gauge, Grid2x2, Laptop, ListChecks, ListOrdered, Lock, MessageCircleQuestion, MessageSquareText,
  Monitor, NotebookPen, PenLine, ALargeSmall, SlidersHorizontal, Smartphone, Timer, UserCheck, Users, WifiOff, EyeOff,
} from "lucide-react";
import { DemoJoin, DemoRoom } from "@/components/public/demo-room";
import { AiIcon } from "@/components/interactions/ai/ai-icon";
import "./home.css";

export const metadata: Metadata = {
  title: { absolute: "Clearway Live" },
  description: "Type the code on the screen to join your team's room. Clearway Live is how Clearway runs Wayfinding retreats and team workshops: the room's answers on the screen the moment they're sent.",
};

const notes: Record<string, string> = {
  empty: "Type the code you see on the screen.",
  unknown: "We couldn't find a room with that code. Check the screen and try again.",
  unavailable: "We can't reach the room right now. Try again in a moment, or scan the QR code on the screen.",
};

const interactions = [
  { icon: Cloud, name: "Word cloud", text: "One to three words each. Words that come up again grow larger, similar answers count together, and the room's most common answer stands out." },
  { icon: MessageSquareText, name: "Open text", text: "Sentences land on a wall as cards. AI gathers similar answers into labelled groups as they arrive, and every grouping can be undone." },
  { icon: MessageCircleQuestion, name: "Q&A", text: "Anonymous questions the room can upvote. The most asked rise to the top, and the facilitator spotlights one at a time." },
  { icon: ListChecks, name: "Multiple choice", text: "One tap each. Live bars grow and trade places as answers arrive." },
  { icon: Gauge, name: "Scale", text: "A quick read of the room. The screen shows the average and how the room is spread." },
  { icon: ListOrdered, name: "Ranking", text: "Tap options in order of priority. The screen shows the room's combined order, and the facilitator can let people suggest an option that's missing." },
  { icon: ChartPie, name: "100 points", text: "Spread a budget across priorities. Each one's share of the room's points grows as answers land." },
  { icon: Grid2x2, name: "2x2 grid", text: "Place each item between two axes, such as impact and effort. The screen shows where the room put it." },
  { icon: SlidersHorizontal, name: "Statements", text: "Rate statements from disagree to agree. The screen shows where the room stands on each one." },
  { icon: Lock, name: "Private form", text: "Answers only the facilitators read. The screen shows how many have answered and nothing more." },
  { icon: PenLine, name: "Sign together", text: "Each person signs on their phone, and the signatures gather on the screen as one shared commitment." },
  { icon: BookOpen, name: "Content screens", text: "Headlines with the detail on every phone, Scripture with its translation, prayer and silence, images and walk-in screens." },
];

const steps = [
  { name: "Discover", text: "Your congregational survey, the Four Helpful Lists and leadership interviews come into one place, with themes your facilitator reviews before anyone sees them." },
  { name: "Pre-call", text: "Ninety minutes on video, one to two weeks before the retreat. The team signs in, looks at what the survey said, celebrates what God has done and starts writing." },
  { name: "Day 1", text: "The 10-year Future through the Five Lenses: Congregation, Community, Leadership, Operations and Learning, written in the present tense. Then the 3-year Vision and its Vision Outcomes, held provisionally overnight." },
  { name: "Overnight", text: "Your facilitators review a draft of each lens built from the room's own words, every sentence traced to the answers it came from. Nothing reaches the room until they've reviewed it." },
  { name: "Day 2", text: "A read-back to confirm the room was heard, a pre-mortem on what could stop the plan, and the 1-year Outlook as CORE goals. Then your own team takes the remote for commander's intent." },
  { name: "After", text: "Vision Outcomes and goals go to CORE in one step. Your report and a draft visibility plan are assembled from the engagement, so your facilitator edits rather than starts from a blank page." },
];

const room = [
  { icon: Monitor, name: "One TV, on its own computer", text: "The church sets up a computer at the TV. It opens live.clearway.co/tv and pairs with a six-digit code, so the screen never depends on the facilitator's laptop." },
  { icon: ALargeSmall, name: "Type sized for the room", text: "One setting scales every word on the screen, from a large hall down to a U-shape of eight, where the type is largest." },
  { icon: Timer, name: "Phones in short bursts", text: "Phones come out for three to five minutes at a time with a quiet countdown, then go back down so the team can talk." },
  { icon: WifiOff, name: "Ready for weak wifi", text: "Answers save on the phone and send in order when the signal returns. The screen holds its last picture, and the easel stays the room's first record." },
  { icon: NotebookPen, name: "A scribe at the side table", text: "Clearway's scribe captures quotes, decisions, tensions and actions as tagged cards, with photos of the easel, each attached to the moment it happened." },
  { icon: Users, name: "The room decides together", text: "Votes and points show where the room is. They don't decide. The team reaches its decisions together, by consensus." },
];

export default async function HomePage({ searchParams }: { searchParams: Promise<{ code?: string; status?: string }> }) {
  const { code, status } = await searchParams;
  const note = status ? notes[status] : undefined;
  return <div className="home" data-surface="phone" data-theme="dark">
    <a className="skip-link button-link" href="#main">Skip to content</a>
    <header className="home-header">
      <div className="home-width home-bar">
        <Link href="/" className="brand" aria-label="Clearway Live home">clearway<span>live</span></Link>
        <nav className="home-nav" aria-label="On this page">
          <a href="#how">How it works</a><a href="#ask">Ask the room</a><a href="#wayfinding">Wayfinding</a><a href="#privacy">Privacy</a>
        </nav>
        <Link href="/sign-in" className="home-signin">Facilitator sign-in</Link>
      </div>
    </header>

    <main id="main">
      <section className="home-width home-hero" id="join" aria-labelledby="join-title">
        <div className="home-hero-copy">
          <p className="home-eyebrow"><Smartphone size={16} aria-hidden="true" />Joining your team?</p>
          <h1 id="join-title" className="home-h1">Type the code <strong>on the screen.</strong></h1>
          <p className="home-lead">It&apos;s on the TV at the front of the room, beside the QR code. There&apos;s no app to install, and your answers show on the screen without your name.</p>
          <form className="join-form" action="/join" method="get">
            <label htmlFor="room-code" className="join-label">Room code</label>
            <div className="join-row">
              <input id="room-code" name="code" className="join-input" defaultValue={code ?? ""} placeholder={"A7C3E91F"} autoComplete="off" autoCapitalize="characters"
                spellCheck={false} maxLength={40} enterKeyHint="go" aria-invalid={Boolean(note)} aria-describedby="join-help" />
              <button className="join-button" type="submit">Join<ArrowRight size={20} aria-hidden="true" /></button>
            </div>
            <p id="join-help" className={`join-help${note ? " is-note" : ""}`} role={note ? "status" : undefined}>{note ?? "Most people scan the QR code on the screen. Typing the code is for when you can't."}</p>
          </form>
          <p className="home-small">The first time, you&apos;ll confirm your email so your facilitator knows you&apos;re on the team&apos;s list.</p>
          <div className="home-links">
            <Link href="/tv" prefetch={false} className="home-link"><Monitor size={18} aria-hidden="true" />Setting up the TV? Open the TV screen</Link>
            <Link href="/practice" className="home-link"><Smartphone size={18} aria-hidden="true" />Trying it first? Join the practice room</Link>
          </div>
        </div>
        <figure className="home-hero-screen">
          <DemoJoin />
          <figcaption className="demo-caption">What your team sees on the TV as people arrive</figcaption>
        </figure>
      </section>

      <section className="home-section" id="how" aria-labelledby="how-title">
        <div className="home-width">
          <p className="home-eyebrow">How it works</p>
          <h2 id="how-title" className="home-h2">One room, <strong>three screens.</strong></h2>
          <p className="home-lead">A single screen can&apos;t be readable from the back of the room, hold every detail and remind the facilitator what comes next. Clearway Live gives each job its own screen, and all three follow the room together.</p>
          <div className="home-grid three">
            <article className="home-card"><span className="home-icon"><Monitor size={22} aria-hidden="true" /></span><h3 className="home-h3">The TV</h3>
              <p>The headline. Large type, one idea, and the room&apos;s answers landing the moment they&apos;re sent.</p></article>
            <article className="home-card"><span className="home-icon"><Smartphone size={22} aria-hidden="true" /></span><h3 className="home-h3">Your phone</h3>
              <p>The depth. The full prompt, the detail and Scripture behind it, and your answer box. You can look back at earlier steps, never ahead of the room.</p></article>
            <article className="home-card"><span className="home-icon"><Laptop size={22} aria-hidden="true" /></span><h3 className="home-h3">The facilitator&apos;s view</h3>
              <p>What&apos;s next, presenter notes, who&apos;s here and how many have answered, with a phone remote to run the room from anywhere in it. The room never sees it.</p></article>
          </div>
        </div>
      </section>

      <section className="home-section is-demo" aria-labelledby="alive-title">
        <div className="home-width">
          <p className="home-eyebrow">The screen is alive</p>
          <h2 id="alive-title" className="home-h2">Watch your answer <strong>land.</strong></h2>
          <p className="home-lead">Every answer reaches the screen in under a second. Nothing refreshes and nothing waits for a reveal. Words grow as more people say them, bars trade places as answers arrive, and quieter voices see their own words on the screen with everyone else&apos;s.</p>
          <DemoRoom />
          <p className="home-small">This is the same screen and phone your team uses, with eight Riverside Church phones answering on a script. What you send here stays in your browser.</p>
        </div>
      </section>

      <section className="home-section" id="ask" aria-labelledby="ask-title">
        <div className="home-width">
          <p className="home-eyebrow">Ask the room</p>
          <h2 id="ask-title" className="home-h2">Any moment can <strong>ask the room.</strong></h2>
          <p className="home-lead">Your facilitator chooses how the room answers. Most steps begin with everyone writing before anyone speaks, so the first voice in the room doesn&apos;t set the direction for everyone else.</p>
          <div className="home-grid four">
            {interactions.map(({ icon: Icon, name, text }) => <article key={name} className="home-card is-compact">
              <span className="home-icon"><Icon size={20} aria-hidden="true" /></span><h3 className="home-h3">{name}</h3><p>{text}</p></article>)}
          </div>
          <p className="home-small">The same tools run Clearway team workshops, so a single session is as easy to open as a two-day retreat.</p>
        </div>
      </section>

      <section className="home-section" id="wayfinding" aria-labelledby="wf-title">
        <div className="home-width">
          <p className="home-eyebrow">Built for Wayfinding</p>
          <h2 id="wf-title" className="home-h2">The whole engagement, <strong>in one place.</strong></h2>
          <p className="home-lead">Wayfinding is how Clearway helps a church discern where God is leading and decide what comes next. Clearway Live holds the engagement from the first survey to the plan your team will live by, so nothing is retyped between steps.</p>
          <ol className="home-steps">
            {steps.map((step, i) => <li key={step.name} className="home-step"><span className="home-step-n" aria-hidden="true">{i + 1}</span>
              <div><h3 className="home-h3">{step.name}</h3><p>{step.text}</p></div></li>)}
          </ol>
          <div className="home-panel">
            <div><h3 className="home-h3">Every goal meets CORE before it leaves the room</h3>
              <p>Each 1-year goal is <strong>Connected</strong> to a Vision Outcome, <strong>Owned</strong> by one person, has a clear <strong>Result</strong> and an agreed <strong>End date</strong>. The goal builder asks for an owner and a date on every goal while the team is still together.</p></div>
            <a href="https://www.clearway.co/services/strategic-planning" className="home-button is-light">Learn about Wayfinding<ArrowRight size={18} aria-hidden="true" /></a>
          </div>
        </div>
      </section>

      <section className="home-section" id="room" aria-labelledby="room-title">
        <div className="home-width">
          <p className="home-eyebrow">In the room</p>
          <h2 id="room-title" className="home-h2">Made for a team <strong>around one table.</strong></h2>
          <p className="home-lead">A Wayfinding retreat is usually about eight leaders in a U-shape with one TV, a facilitator, a co-facilitator and a scribe. Everything is built for that room.</p>
          <div className="home-grid three">
            {room.map(({ icon: Icon, name, text }) => <article key={name} className="home-card"><span className="home-icon"><Icon size={22} aria-hidden="true" /></span>
              <h3 className="home-h3">{name}</h3><p>{text}</p></article>)}
          </div>
          <div className="home-setup">
            <h3 className="home-h3">Setting up the TV</h3>
            <ol className="home-setup-list">
              <li>On the computer connected to the TV or projector, open <strong>live.clearway.co/tv</strong>.</li>
              <li>A six-digit code appears. Your facilitator enters it on their laptop, and the screen is paired.</li>
              <li>Press <kbd>F</kbd> for full screen. The screen stays awake on its own.</li>
            </ol>
            <Link href="/tv" prefetch={false} className="home-button">Open the TV screen<ArrowRight size={18} aria-hidden="true" /></Link>
          </div>
        </div>
      </section>

      <section className="home-section" id="privacy" aria-labelledby="privacy-title">
        <div className="home-width">
          <p className="home-eyebrow">Privacy</p>
          <h2 id="privacy-title" className="home-h2">Anonymous on the screen, <strong>so the room can be honest.</strong></h2>
          <p className="home-lead">People say what they actually think when nobody in the room can tell who wrote it. These commitments hold in every session.</p>
          <div className="home-grid two">
            <article className="home-card"><span className="home-icon"><EyeOff size={22} aria-hidden="true" /></span><h3 className="home-h3">No names on the screen</h3>
              <p>Answers show without names. Nobody in the room sees who wrote what, the facilitator included. Names stay with answers only for the record.</p></article>
            <article className="home-card"><span className="home-icon"><UserCheck size={22} aria-hidden="true" /></span><h3 className="home-h3">Names only where they belong</h3>
              <p>A name appears only when a step calls for one, such as owning a goal or signing a shared commitment, and your phone says so before you answer.</p></article>
            <article className="home-card"><span className="home-icon"><Lock size={22} aria-hidden="true" /></span><h3 className="home-h3">Private means private</h3>
              <p>A private form sends the screen a count and nothing else. The database enforces it, so it never depends on what a screen chooses to show.</p></article>
            <article className="home-card"><span className="home-icon"><AiIcon size={22} /></span><h3 className="home-h3">AI you can see</h3>
              <p>AI groups similar answers and drafts overnight summaries. Every grouping on the screen is marked and can be undone, and nothing drafted overnight reaches the room until your facilitators have reviewed it. <Link href="/how-we-use-ai" className="home-inline">How we use AI</Link></p></article>
          </div>
        </div>
      </section>

      <section className="home-section is-close" aria-labelledby="close-title">
        <div className="home-width home-close">
          <div>
            <h2 id="close-title" className="home-h2">Bring it <strong>to your church.</strong></h2>
            <p className="home-lead">Clearway Live is how we run Wayfinding retreats and team workshops with the churches we serve, with a Clearway facilitator in the room.</p>
          </div>
          <div className="home-close-actions">
            <a href="https://www.clearway.co/contact" className="home-button">Talk with us<ArrowRight size={18} aria-hidden="true" /></a>
            <Link href="/sign-in" className="home-link"><Laptop size={18} aria-hidden="true" />Facilitating? Sign in with your Clearway account</Link>
          </div>
        </div>
      </section>
    </main>

    <footer className="home-footer">
      <div className="home-width home-footer-row">
        <span>Clearway Live · Clearway Church Solutions</span>
        <nav aria-label="Footer"><Link href="/how-we-use-ai">How we use AI</Link><Link href="/practice">Practice room</Link><Link href="/sign-in">Facilitator sign-in</Link><a href="https://www.clearway.co">clearway.co</a></nav>
      </div>
    </footer>
  </div>;
}

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ALargeSmall, ArrowRight, Check, Ear, EyeOff, Flag, Laptop, Lock, Monitor, NotebookPen, Quote, ScanEye, Smartphone, Timer, UserCheck, Users, WifiOff, X,
} from "lucide-react";
import { DemoRoom } from "@/components/public/demo-room";
import { Gallery, Reveal, StatsBand, ThreeScreens, type GalleryItem } from "@/components/public/home-parts";
import { LiveWordmark } from "@/components/brand/live-wordmark";
import { AiIcon } from "@/components/interactions/ai/ai-icon";
import "./home.css";

export const metadata: Metadata = {
  title: { absolute: "Clearway Live" },
  description: "Enter the room code from the TV to join your team's room. Clearway Live is how Clearway runs Wayfinding retreats and team workshops: every voice in the room, on one screen.",
};

const notes: Record<string, string> = {
  empty: "Enter the room code from the TV.",
  unknown: "We couldn't find a room with that code. Check the screen and try again.",
  unavailable: "We can't reach the room right now. Try again in a moment, or point your camera at the QR code on the TV.",
};

// For someone who has only heard that their church is using Clearway Live to plan.
const why = [
  { icon: Ear, name: "The quiet voices count too", text: "Everyone writes before anyone speaks, so the newest leader is heard as clearly as the most confident one." },
  { icon: EyeOff, name: "Honest, because it's anonymous", text: "Answers show on the screen without names, so people say what they actually think." },
  { icon: ScanEye, name: "See where the team really is", text: "Agreement, tension and what nobody has said yet become visible while you're still in the room to talk about it." },
  { icon: Flag, name: "Leave with a plan you own", text: "What the team decides becomes Vision Outcomes and goals with an owner and a date, ready for the year ahead." },
];

// Real screens from the Riverside Church team workshop run in CI.
const gallery: GalleryItem[] = [
  { key: "word-cloud", tag: "Word cloud", name: "One word each, and the room's words grow", text: "Words that come up again grow larger and the most common one stands out. Similar answers count together, and AI can combine near-duplicates with an undo.",
    tv: "/home/tv-word-cloud.webp", tvAlt: "The TV: a word cloud with youth largest, then hope and joy", phone: "/home/phone-word-cloud.webp", phoneAlt: "The phone: a word or two, with two answers sent" },
  { key: "wall", tag: "Open text", name: "Sentences that gather into themes", text: "Answers land on a wall as cards. AI groups similar answers into labelled themes as they arrive, and a short summary can go up when the facilitator chooses.",
    tv: "/home/tv-wall.webp", tvAlt: "The TV: an AI summary above a theme called Baptisms, with the newest answers", phone: "/home/phone-wall.webp", phoneAlt: "The phone: a sentence sent, with room to write another" },
  { key: "points", tag: "100 points", name: "Where would you spend it?", text: "Everyone spreads 100 points across the priorities. Bars grow and trade places as answers land, and a line shows where the top few end.",
    tv: "/home/tv-points.webp", tvAlt: "The TV: five priorities as bars, Shared priorities leading at 33 percent", phone: "/home/phone-points.webp", phoneAlt: "The phone: sliders placing 100 points" },
  { key: "grid", tag: "2x2 matrix", name: "Effort and impact, placed by everyone", text: "Each person places each item between two axes. The screen shows where the room put it, one numbered dot per item.",
    tv: "/home/tv-grid.webp", tvAlt: "The TV: a 2x2 matrix of effort and impact with five numbered focus areas", phone: "/home/phone-grid.webp", phoneAlt: "The phone: placing focus areas on the grid" },
  { key: "qa", tag: "Q&A", name: "The questions people actually have", text: "Anonymous questions the room can upvote. The most asked rise to the top, and the facilitator spotlights one at a time.",
    tv: "/home/tv-qa.webp", tvAlt: "The TV: questions ranked by votes, Who decides what we stop doing on top with 8", phone: "/home/phone-qa.webp", phoneAlt: "The phone: questions with upvote buttons and a box to ask" },
  { key: "sign", tag: "Sign together", name: "A commitment the whole team signs", text: "Each person signs on their phone, and the signatures gather on the screen as one shared commitment.",
    tv: "/home/tv-sign.webp", tvAlt: "The TV: signatures with names, 8 of 8 signed", phone: "/home/phone-sign.webp", phoneAlt: "The phone: the commitment, signed" },
  { key: "prayer", tag: "Prayer and Scripture", name: "Room for prayer and the Word", text: "Content screens hold prayer and silence, Scripture with its translation, and headlines with the detail on every phone. During prayer, phones say Phones away.",
    tv: "/home/tv-prayer.webp", tvAlt: "The TV: Let's begin in prayer", phone: "/home/phone-prayer.webp", phoneAlt: "The phone: Phones away, we're praying together" },
];

const compare = [
  { topic: "Who gets heard", without: "The first few voices set the direction for everyone else.", with: "Everyone writes first, on their own phone, before anyone speaks." },
  { topic: "How honest it gets", without: "People soften what they think when everyone can see who said it.", with: "Answers show on the screen without names." },
  { topic: "Reading the room", without: "The facilitator senses agreement by feel.", with: "Agreement and tension show on the screen as they form." },
  { topic: "What's kept", without: "Easel sheets photographed and retyped afterwards.", with: "Every answer is kept with the step it belongs to, and the easel is still there." },
  { topic: "Leaving the room", without: "A plan that arrives weeks later in a report.", with: "Goals with an owner and a date before you leave, ready for the year ahead." },
];

const steps = [
  { name: "Discover", photo: "/home/room-sticky-wall.webp", text: "Your congregational survey, the Four Helpful Lists and leadership interviews come into one place, with themes your facilitator reviews before anyone sees them." },
  { name: "Pre-call", photo: "/home/room-boardroom.webp", text: "Ninety minutes on video, one to two weeks out. The team signs in, looks at what the survey said, celebrates what God has done and starts writing." },
  { name: "Day 1", photo: "/home/room-five-lenses.webp", text: "The 10-year Future through the Five Lenses, written in the present tense. Then the 3-year Vision and its Vision Outcomes, held provisionally overnight." },
  { name: "Overnight", photo: "/home/room-retreat-venue.webp", text: "Your facilitators review a draft of each lens built from the room's own words, every sentence traced to the answers it came from." },
  { name: "Day 2", photo: "/home/room-u-table.webp", text: "A read-back to confirm the room was heard, a pre-mortem on what could stop the plan, the 1-year Outlook as goals with an owner and an end date, then your own team takes the remote." },
  { name: "After", photo: "/home/room-calendar.webp", text: "Your report and a draft visibility plan are assembled from the engagement. Each goal owner gets a check-in at 30, 60 and 90 days, and your elders or board get a read-only copy." },
];

const room = [
  { icon: Monitor, name: "One TV, on its own computer", text: "The church sets up a computer at the TV. It opens live.clearway.co/tv and pairs with a six-digit code." },
  { icon: ALargeSmall, name: "Type sized for the room", text: "One setting scales every word on the screen, down to a U-shape of eight, where the type is largest." },
  { icon: Timer, name: "Phones in short bursts", text: "Phones come out for three to five minutes with a quiet countdown, then go back down so the team can talk." },
  { icon: WifiOff, name: "Ready for weak Wi-Fi", text: "Answers save on the phone and send in order when the signal returns. The screen holds its last picture." },
  { icon: NotebookPen, name: "A scribe at the side table", text: "Quotes, decisions, tensions and actions captured as tagged cards, with photos of the easel." },
  { icon: Users, name: "The room decides together", text: "Votes and points show where the room is. They don't decide. The team decides together, by consensus." },
];

const strip = [
  { src: "/home/room-team-discussion.webp", alt: "A church team around a table, talking with a facilitator" },
  { src: "/home/room-values-voting.webp", alt: "Leaders voting with sticky dots on values written on the wall" },
  { src: "/home/room-round-tables.webp", alt: "A larger group at round tables with two screens at the front" },
  { src: "/home/room-sticky-wall.webp", alt: "A team placing sticky notes on a wall of easel sheets" },
  { src: "/home/room-calendar.webp", alt: "Leaders building a season calendar with sticky notes" },
  { src: "/home/room-five-lenses.webp", alt: "A team at a table with the Five Lenses on the screen" },
];

const quotes = [
  { quote: "Our team came out with a clear set of strategic priorities for the future and clarity on what it will take to get us there. Chris leads skillfully and with intention creating a collaborative environment where everyone feels heard and valued.", title: "Lead Pastor" },
  { quote: "Chris' presentations, consulting as well as pointed questions to lead our discussions, enabled us to land on a clear path for the future and provided us with the tools to have successful team dynamics.", title: "Executive Pastor" },
  { quote: "Chris listened well to our needs and worked with us through the process so we could clarify our values and vision in following Jesus Christ, and agree on plans we will pursue.", title: "Denominational Regional President" },
];

const faqs = [
  { q: "Do I need to download an app?", a: "No. Clearway Live runs in your phone's browser. Point your camera at the QR code on the TV, or enter the room code at live.clearway.co." },
  { q: "Do I need an account?", a: "No account or password. The first time, you confirm your email with a six-digit code, so the room knows you're on your team's list. After that your phone stays signed in for the engagement." },
  { q: "Who sees what I write?", a: "On the screen, nobody sees your name. Nobody in the room sees who wrote what, the facilitator included. Your name is kept with your answers only for the record. When a step needs a name, like signing a commitment, your phone tells you before you answer." },
  { q: "Can I change my answer?", a: "Yes. While a step is open, your own answers stay on your phone, and you can change or withdraw them. The screen moves with you." },
  { q: "Can I try it before the retreat?", a: "Yes. The practice room works on any phone, with no code and no sign-in, so you can see how answering feels before the day." },
  { q: "What if the Wi-Fi drops?", a: "Your answers save on your phone and send in order when the signal comes back. The screen keeps its last picture, and the easel is still the room's first record." },
  { q: "What does our church need to set up?", a: "A TV or projector with a computer connected to it, and Wi-Fi for the room. The computer opens live.clearway.co/tv, and your facilitator pairs it with a code." },
  { q: "What happens to our answers afterwards?", a: "They stay with your church's engagement, and your facilitators use them to write your report. Elders can be given a read-only copy of the finished plan, which never shows individual answers." },
  { q: "How is AI used?", a: "AI groups similar answers and drafts summaries. Every grouping on the screen is marked and can be undone, and nothing drafted overnight reaches the room until your facilitators have reviewed it." },
];

export default async function HomePage({ searchParams }: { searchParams: Promise<{ code?: string; status?: string }> }) {
  const { code, status } = await searchParams;
  const note = status ? notes[status] : undefined;
  return <div className="home" data-surface="phone" data-theme="dark">
    <a className="skip-link button-link" href="#main">Skip to content</a>
    <header className="home-header">
      <div className="home-width home-bar">
        <Link href="/" className="home-brand" aria-label="Clearway Live home"><LiveWordmark theme="dark" size="page" label={null} /></Link>
        <nav className="home-nav" aria-label="On this page">
          <a href="#how">How it works</a><a href="#ask">Ways to answer</a><a href="#wayfinding">Wayfinding</a><a href="#faq">Questions</a>
        </nav>
        <Link href="/sign-in" className="home-signin">Facilitator sign-in</Link>
      </div>
    </header>

    <main id="main">
      {/* Joining comes first: the code from the screen, then everything else. */}
      <section className="home-hero" id="join" aria-labelledby="join-title">
        <div className="home-width home-hero-grid">
          <div className="home-hero-copy">
            <p className="home-eyebrow"><Smartphone size={16} aria-hidden="true" />Joining your team?</p>
            <h1 id="join-title" className="home-h1">Join your team <strong>in the room.</strong></h1>
            <p className="home-lead">The room code is on the TV at the front of the room. Enter it here and you&apos;re in, right in your phone&apos;s browser. Your answers reach the screen without your name.</p>
            <form className="join-form" action="/join" method="get">
              <label htmlFor="room-code" className="join-label">Room code</label>
              <div className="join-row">
                <input id="room-code" name="code" className="join-input" defaultValue={code ?? ""} placeholder="A7C3E91F" autoComplete="off" autoCapitalize="characters"
                  spellCheck={false} maxLength={40} enterKeyHint="go" aria-invalid={Boolean(note)} aria-describedby="join-help" />
                <button className="join-button" type="submit">Join<ArrowRight size={20} aria-hidden="true" /></button>
              </div>
              <p id="join-help" className={`join-help${note ? " is-note" : ""}`} role={note ? "status" : undefined}>{note ?? "Or point your phone's camera at the QR code on the TV."}</p>
            </form>
            <div className="home-links">
              <Link href="/tv" prefetch={false} className="home-link"><Monitor size={18} aria-hidden="true" />Setting up the TV? Open the TV screen</Link>
              <Link href="/practice" className="home-link"><Smartphone size={18} aria-hidden="true" />Trying it first? Join the practice room</Link>
            </div>
          </div>
          <div className="home-hero-visual" aria-label="A Clearway retreat room, with the screen and a phone">
            <div className="hero-photo"><Image src="/home/room-hero-table.webp" alt="A Clearway facilitator leading a church team around a boardroom table, with Scripture on the screen" fill priority sizes="(max-width: 1024px) 92vw, 640px" /></div>
            <DemoRoom variant="hero" />
          </div>
        </div>
      </section>

      <section className="home-section is-why" data-theme="light" aria-labelledby="why-title">
        <div className="home-width">
          <Reveal className="why-head">
            <p className="home-eyebrow">New to Clearway Live?</p>
            <h2 id="why-title" className="home-h2">Every voice in the room,<br /> <strong>on one screen.</strong></h2>
            <p className="home-lead">Your church is planning its next season with Clearway. Clearway Live is how your leadership team thinks out loud together: everyone answers on their own phone, and the room&apos;s answers appear on the screen as they&apos;re sent.</p>
          </Reveal>
          <div className="why-grid">
            {why.map(({ icon: Icon, name, text }, i) => <Reveal key={name} step={i} className="why-card">
              <span className="home-icon"><Icon size={22} aria-hidden="true" /></span><h3 className="home-h3">{name}</h3><p>{text}</p></Reveal>)}
          </div>
        </div>
      </section>

      <section className="photo-strip" aria-label="Clearway retreat rooms">
        <div className="photo-track">
          {[...strip, ...strip].map((p, i) => <figure key={i} className="photo-tile" aria-hidden={i >= strip.length}><Image src={p.src} alt={i >= strip.length ? "" : p.alt} width={600} height={450} sizes="320px" /></figure>)}
        </div>
        <p className="home-width photo-caption">Church leadership teams at Clearway Wayfinding retreats. These are the rooms Clearway Live is built for.</p>
      </section>

      <section className="home-section" id="how" data-theme="light" aria-labelledby="how-title">
        <div className="home-width">
          <Reveal>
            <p className="home-eyebrow">How it works</p>
            <h2 id="how-title" className="home-h2">Look up together.<br /> <strong>Answer on your own.</strong></h2>
            <p className="home-lead">Your team watches one screen at the front of the room and answers on their own phones, while your facilitator moves the room from one step to the next.</p>
          </Reveal>
          <Reveal><ThreeScreens /></Reveal>
        </div>
      </section>

      <section className="home-section is-demo" aria-labelledby="alive-title">
        <div className="home-width">
          <Reveal>
            <p className="home-eyebrow">Try it</p>
            <h2 id="alive-title" className="home-h2">Watch your answer <strong>land.</strong></h2>
            <p className="home-lead">Every answer reaches the screen in under a second. Nothing refreshes and nothing waits for a reveal. Words grow as more people say them, and bars trade places as answers arrive. Answer on the phone below and see your own answer join the room.</p>
          </Reveal>
          <DemoRoom />
          <p className="home-small">The same screen and phone your team uses, with eight Riverside Church phones answering on a script. What you send here stays in your browser.</p>
        </div>
      </section>

      <section className="stats" aria-label="Clearway Live in numbers">
        <StatsBand />
      </section>

      <section className="home-section" id="ask" data-theme="light" aria-labelledby="ask-title">
        <div className="home-width">
          <Reveal>
            <p className="home-eyebrow">Ways to answer</p>
            <h2 id="ask-title" className="home-h2">See it on the screen, <strong>and in your hand.</strong></h2>
            <p className="home-lead">Your facilitator chooses how the room answers. Pick one to see it on the TV and on a phone. These are real screens from a Riverside Church team workshop.</p>
          </Reveal>
          <Reveal><Gallery items={gallery} /></Reveal>
          <p className="home-small">Also multiple choice, rating scales, ranking, agree or disagree statements, and private responses, where only the facilitators read the answers and the screen shows a count. Wayfinding adds its own tools, from a themed brainstorm to a consensus check.</p>
        </div>
      </section>

      <section className="home-section" aria-labelledby="compare-title">
        <div className="home-width">
          <Reveal>
            <p className="home-eyebrow">What changes</p>
            <h2 id="compare-title" className="home-h2">The same room, <strong>with every voice in it.</strong></h2>
          </Reveal>
          <div className="compare">
            <div className="compare-row is-head" aria-hidden="true"><span /><span>Easel sheets alone</span><span>With Clearway Live</span></div>
            {compare.map((row, i) => <Reveal key={row.topic} step={i}><div className="compare-row">
              <h3 className="compare-topic">{row.topic}</h3>
              <p className="compare-without"><X size={18} aria-hidden="true" /><span><span className="compare-label">Easel sheets alone</span>{row.without}</span></p>
              <p className="compare-with"><Check size={18} aria-hidden="true" /><span><span className="compare-label">With Clearway Live</span>{row.with}</span></p>
            </div></Reveal>)}
          </div>
        </div>
      </section>

      <section className="home-section" id="wayfinding" data-theme="light" aria-labelledby="wf-title">
        <div className="home-width">
          <Reveal>
            <p className="home-eyebrow">Built for Wayfinding</p>
            <h2 id="wf-title" className="home-h2">The whole engagement, <strong>in one place.</strong></h2>
            <p className="home-lead">Wayfinding is how Clearway helps a church discern where God is leading and decide what comes next. Clearway Live holds the engagement from the first survey to the plan your team will live by, so nothing is retyped between steps.</p>
          </Reveal>
          <ol className="journey">
            {steps.map((step, i) => <li key={step.name}><Reveal step={i} className="journey-step">
              <div className="journey-photo"><Image src={step.photo} alt="" width={600} height={450} sizes="(max-width: 640px) 92vw, 360px" /><span className="journey-n">{i + 1}</span></div>
              <div className="journey-copy"><h3 className="home-h3">{step.name}</h3><p>{step.text}</p></div>
            </Reveal></li>)}
          </ol>
          <Reveal className="home-panel">
            <div><h3 className="home-h3">Every goal meets CORE before it leaves the room</h3>
              <p>Each 1-year goal is <strong>Connected</strong> to a Vision Outcome, <strong>Owned</strong> by one person, has a clear <strong>Result</strong> and an agreed <strong>End date</strong>. The goal builder asks for an owner and a date on every goal while the team is still together.</p></div>
            <a href="https://www.clearway.co/services/strategic-planning" className="home-button is-light">Learn about Wayfinding<ArrowRight size={18} aria-hidden="true" /></a>
          </Reveal>
        </div>
      </section>

      <section className="home-section is-room" id="room" aria-labelledby="room-title">
        <div className="home-width room-grid">
          <Reveal className="room-photo"><Image src="/home/room-u-table.webp" alt="A facilitator at the front of a retreat room, a team around a U-shaped table" width={600} height={800} sizes="(max-width: 1024px) 92vw, 420px" /></Reveal>
          <div>
            <Reveal>
              <p className="home-eyebrow">In the room</p>
              <h2 id="room-title" className="home-h2">Made for a team<br /> <strong>around one table.</strong></h2>
              <p className="home-lead">A Wayfinding retreat is usually about eight leaders in a U-shape with one TV, a facilitator, a co-facilitator and a scribe.</p>
            </Reveal>
            <div className="room-list">
              {room.map(({ icon: Icon, name, text }, i) => <Reveal key={name} step={i} className="room-item"><span className="home-icon"><Icon size={20} aria-hidden="true" /></span>
                <div><h3 className="home-h3">{name}</h3><p>{text}</p></div></Reveal>)}
            </div>
            <Reveal className="home-setup">
              <h3 className="home-h3">Setting up the TV</h3>
              <ol className="home-setup-list">
                <li>On the computer connected to the TV or projector, open <strong>live.clearway.co/tv</strong>.</li>
                <li>A six-digit code appears. Your facilitator enters it on their laptop, and the screen is paired.</li>
                <li>Press <kbd>F</kbd> for full screen. The screen stays awake on its own.</li>
              </ol>
              <Link href="/tv" prefetch={false} className="home-button">Open the TV screen<ArrowRight size={18} aria-hidden="true" /></Link>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="home-section" id="privacy" data-theme="light" aria-labelledby="privacy-title">
        <div className="home-width">
          <Reveal>
            <p className="home-eyebrow">Privacy</p>
            <h2 id="privacy-title" className="home-h2">Say what you actually think.<br /> <strong>The screen won&apos;t say it was you.</strong></h2>
          </Reveal>
          <div className="home-grid four">
            <Reveal className="home-card"><span className="home-icon"><EyeOff size={22} aria-hidden="true" /></span><h3 className="home-h3">No names on the screen</h3>
              <p>Nobody in the room sees who wrote what, the facilitator included. Names stay with answers only for the record.</p></Reveal>
            <Reveal step={1} className="home-card"><span className="home-icon"><UserCheck size={22} aria-hidden="true" /></span><h3 className="home-h3">Names only where they belong</h3>
              <p>A name appears only when a step calls for one, like signing a commitment, and your phone says so first.</p></Reveal>
            <Reveal step={2} className="home-card"><span className="home-icon"><Lock size={22} aria-hidden="true" /></span><h3 className="home-h3">Private forms stay private</h3>
              <p>Your facilitators read the answers. The screen shows how many people have answered, and the answers are kept out of its data entirely.</p></Reveal>
            <Reveal step={3} className="home-card"><span className="home-icon"><AiIcon size={22} /></span><h3 className="home-h3">AI you can see</h3>
              <p>AI groups similar answers and drafts summaries. Each one is marked and can be undone, and your team decides what stays. <Link href="/how-we-use-ai" className="home-inline">How we use AI</Link></p></Reveal>
          </div>
        </div>
      </section>

      <section className="home-section is-quotes" aria-labelledby="quotes-title">
        <div className="home-width">
          <Reveal>
            <p className="home-eyebrow">From the churches we serve</p>
            <h2 id="quotes-title" className="home-h2">Leaders on planning <strong>with Clearway.</strong></h2>
          </Reveal>
          <div className="home-grid three">
            {quotes.map((q, i) => <Reveal key={q.quote} step={i} className="quote-card">
              <Quote size={28} aria-hidden="true" className="quote-mark" /><blockquote><p>{q.quote}</p></blockquote>
              <p className="quote-who"><strong>{q.title}</strong></p></Reveal>)}
          </div>
        </div>
      </section>

      <section className="home-section" id="faq" data-theme="light" aria-labelledby="faq-title">
        <div className="home-width faq-grid">
          <Reveal>
            <p className="home-eyebrow">Questions</p>
            <h2 id="faq-title" className="home-h2">Before <strong>you join.</strong></h2>
            <p className="home-lead">The things people ask on the morning of a retreat.</p>
            <div className="faq-try">
              <span className="home-icon"><Smartphone size={20} aria-hidden="true" /></span>
              <div><h3 className="home-h3">Try it before the day</h3>
                <p>Answer a few questions in the practice room and watch them land, on your own phone.</p>
                <Link href="/practice" prefetch={false} className="faq-try-link">Join the practice room <ArrowRight size={16} aria-hidden="true" /></Link></div>
            </div>
          </Reveal>
          <div className="faq">
            {faqs.map((f, i) => <details key={f.q} className="faq-item" open={i === 0}><summary>{f.q}</summary><p>{f.a}</p></details>)}
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
            <a href="https://www.clearway.co/contact" className="home-button is-light">Talk with us<ArrowRight size={18} aria-hidden="true" /></a>
            <Link href="/sign-in" className="home-link"><Laptop size={18} aria-hidden="true" />Facilitating? Sign in with your Clearway account</Link>
          </div>
        </div>
      </section>
    </main>

    <footer className="home-footer">
      <div className="home-width home-footer-row">
        <LiveWordmark theme="dark" size="app" />
        <nav aria-label="Footer"><Link href="/how-we-use-ai">How we use AI</Link><Link href="/practice">Practice room</Link><Link href="/sign-in">Facilitator sign-in</Link><a href="https://www.clearway.co">clearway.co</a></nav>
      </div>
    </footer>
  </div>;
}

import { ArrowUpRight, Laptop, Smartphone } from "lucide-react";
import { Surface } from "@/components/layout/surface";
import { ButtonLink } from "@/components/ui/button-link";

export default function HomePage() {
  return <Surface surface="control" theme="light">
    <main id="main" className="page-width">
      <section className="hero" aria-labelledby="welcome-title">
        <div className="eyebrow-live"><ArrowUpRight size={18} aria-hidden="true" /> Clearway Church Solutions</div>
        <h1 id="welcome-title">Good work begins<br />with <strong>listening.</strong></h1>
        <p>A shared space for your church team to listen, discern and decide together.</p>
      </section>
      <section className="paths" aria-label="Choose how to join">
        <article className="path-card">
          <span className="path-icon"><Laptop size={24} aria-hidden="true" /></span>
          <h2>Facilitating a room?</h2>
          <p>Clearway facilitators prepare the engagement and help the room take its next step.</p>
          <ButtonLink href="/sign-in">Open Clearway sign-in</ButtonLink>
        </article>
        <article className="path-card">
          <span className="path-icon"><Smartphone size={24} aria-hidden="true" /></span>
          <h2>Joining your team?</h2>
          <p>Your invite has the link to your room. Open it on the phone you’ll bring with you.</p>
          <ButtonLink href="/room">Find your room link</ButtonLink>
        </article>
      </section>
    </main>
    <footer className="footer page-width"><span>Clearway Church Solutions</span><span>Listen. Discern. Decide together.</span></footer>
  </Surface>;
}

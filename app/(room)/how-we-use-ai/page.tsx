import type { Metadata } from "next";
import { headers } from "next/headers";
import { AiMark } from "@/components/interactions/ai/ai-icon";
import { aiDisclosure } from "@/lib/ai/disclosure";
import { skinForHost } from "@/lib/brand";

// A public phone page: no sign-in. Linked from the room sign-in and the invite email. The address decides the words: live.novetera.co shows
// Novetera's, anywhere else shows Clearway's (the host of a request is the only thing known here, as on the join page). The markup is
// the same as AiDisclosurePage's, with the skin's paragraphs, and the icon credit stays the last line.
export const metadata: Metadata = { title: aiDisclosure().title };
export default async function HowWeUseAi() {
  const text = aiDisclosure(skinForHost((await headers()).get("host")) ?? "clearway");
  return <main id="main" className="page-width narrow">
    <article className="ai-disclosure" data-ai-disclosure="page">
      <h1><AiMark label="AI" /> {text.title}</h1>
      {text.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
      <p className="ai-disclosure-credit">{text.credit}</p>
    </article>
  </main>;
}

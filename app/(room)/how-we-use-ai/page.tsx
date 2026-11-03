import type { Metadata } from "next";
import { AiDisclosurePage } from "@/components/interactions/ai/ai-disclosure";
import { aiPageTitle } from "@/lib/ai/disclosure";

// A public phone page: no sign-in. Linked from the room sign-in and the invite email.
export const metadata: Metadata = { title: aiPageTitle };
export default function HowWeUseAi() {
  return <main id="main" className="page-width narrow"><AiDisclosurePage /></main>;
}

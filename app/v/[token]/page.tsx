import type { Metadata } from "next";
import { LiveWordmark } from "@/components/brand/live-wordmark";
import { ReadOnlyCopy } from "@/components/read-only/read-only-copy";
import { readView } from "@/lib/read-only/server";
import { tokenShape, type RoAnswer } from "@/lib/read-only/policy";
import { serviceClient } from "@/lib/server/supabase";
import "@/components/read-only/read-only.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "The plan", robots: { index: false, follow: false, noarchive: true }, referrer: "no-referrer" };

// The page behind a read-only link. The link is the only key: no sign-in. A link that is unknown, turned off, not yet open or past its engagement gets one
// plain page with the same words and the same shape, so nothing says which it was.
export default async function ReadOnlyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let answer: RoAnswer = { status: "unavailable" };
  if (tokenShape(token)) answer = await readView(serviceClient(), token).catch(() => ({ status: "unavailable" } as RoAnswer));
  if (answer.status !== "ok") return <div className="ro" data-surface="setup" data-theme="light" data-testid="ro-gone">
    <header className="ro-head"><LiveWordmark theme="light" /></header>
    <main id="main" className="ro-main"><div className="ro-gone"><h1>This link isn&rsquo;t available</h1>
      <p>The plan isn&rsquo;t shared at this address. If you were sent it, ask the person at Clearway who sent it for a new link.</p></div></main></div>;
  return <ReadOnlyCopy view={answer} />;
}

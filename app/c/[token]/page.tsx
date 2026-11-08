import { notFound } from "next/navigation";
import { CheckInPhone } from "@/components/check-ins/check-in-phone";
import { Surface } from "@/components/layout/surface";
import { readPhone } from "@/lib/check-ins/server";
import { tokenShape } from "@/lib/check-ins/policy";
import { serviceClient } from "@/lib/server/supabase";
import "@/components/check-ins/check-ins.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your check-in", robots: { index: false, follow: false } };

// The page behind a check-in email's link. The link is the only key: no sign-in. It shows one person's own first steps and goals.
export default async function CheckInPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!tokenShape(token)) notFound();
  const view = await readPhone(serviceClient(), token).catch(() => null);
  if (!view || view.status === "unknown") notFound();
  if (view.status === "ended") return <Surface surface="phone" theme="dark"><main id="main"><div className="ph-app" data-screen="phone-answering">
    <header className="ph-head"><span className="ph-church">{view.church}</span></header>
    <div className="ph-body"><h1 className="ph-headline">This check-in is closed</h1>
      <p className="ph-text">{view.church}&rsquo;s engagement has ended, so the check-ins have stopped. Thank you for the work.</p></div></div></main></Surface>;
  return <Surface surface="phone" theme="dark"><main id="main"><CheckInPhone token={token} view={view} /></main></Surface>;
}

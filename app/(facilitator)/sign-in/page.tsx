import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { authConfig, destination } from "@/lib/auth/policy";

export const metadata: Metadata = { title: "Clearway sign-in" };
export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  const configured = Boolean(authConfig());
  return <main id="main" className="page-width narrow">
    <div className="eyebrow-live"><LockKeyhole size={18} aria-hidden="true" /> For Clearway facilitators</div>
    <h1>Prepare the room.</h1>
    <p>Sign in with your @clearway.co Google account to open your engagements.</p>
    {params.error && <div className="notice" role="status"><p>{params.error === "unavailable"
      ? "Sign-in is unavailable right now. Please try again shortly."
      : "We couldn’t sign you in. Use a Clearway Google account that has access to this app, or check with your Clearway admin."}</p></div>}
    {configured ? <form action={"/auth/google?next=" + destination(params.next)} method="post">
      <button className="button-link" type="submit">Sign in with Google</button>
    </form> : <div className="notice" role="status"><p>Sign-in is unavailable right now. Please try again shortly.</p></div>}
    <p className="sign-in-note">Your account must be on the Clearway user list.</p>
    <Link href="/" className="text-link"><ArrowLeft size={18} aria-hidden="true" /> Return to the start</Link>
  </main>;
}

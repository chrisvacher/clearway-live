import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";

export const metadata: Metadata = { title: "Clearway sign-in" };

export default function SignInPage() {
  return <main id="main" className="page-width narrow">
    <div className="eyebrow-live"><LockKeyhole size={18} aria-hidden="true" /> For Clearway facilitators</div>
    <h1>Prepare the room.</h1>
    <p>This is where your Clearway account will open engagement setup.</p>
    <div className="notice"><p>Google sign-in is being prepared. Your facilitator will let you know when it’s ready.</p></div>
    <Link href="/" className="text-link"><ArrowLeft size={18} aria-hidden="true" /> Return to the start</Link>
  </main>;
}

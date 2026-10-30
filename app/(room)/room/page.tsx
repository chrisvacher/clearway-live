import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Smartphone } from "lucide-react";

export const metadata: Metadata = { title: "Find your room" };

export default function RoomPage() {
  return <main id="main" className="page-width narrow">
    <div className="eyebrow-live"><Smartphone size={18} aria-hidden="true" /> Joining your team</div>
    <h1>Your place in the room.</h1>
    <p>Open the room link in your invite, or ask your facilitator for it.</p>
    <div className="notice"><p>Room sign-in is being prepared. There’s nothing you need to send yet.</p></div>
    <Link href="/" className="text-link"><ArrowLeft size={18} aria-hidden="true" /> Return to the start</Link>
  </main>;
}

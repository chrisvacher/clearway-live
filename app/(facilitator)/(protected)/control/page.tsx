import type { Metadata } from "next";
import Link from "next/link";
import { requireFacilitator } from "@/lib/server/facilitator";

export const metadata: Metadata = { title: "Facilitator control" };

export default async function ControlPage() {
  await requireFacilitator();
  return <main id="main" className="page-width narrow">
    <div className="eyebrow-live">Only you see this</div>
    <h1>Prepare your engagement.</h1>
    <p>Open your engagements to get ready for the room.</p>
    <Link className="button-link" href="/setup">Open engagements</Link>
  </main>;
}

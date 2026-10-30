import type { Metadata } from "next";
import { LockKeyhole } from "lucide-react";
import { requireFacilitator } from "@/lib/server/facilitator";

export const metadata: Metadata = { title: "Your engagements" };

export default async function SetupPage() {
  const { profile, client } = await requireFacilitator();
  const { data: engagements, error } = await client.from("engagements").select("id,title,status").eq("deleted", false).order("created_at", { ascending: false });
  return <main id="main" className="page-width narrow">
    <div className="eyebrow-live"><LockKeyhole size={18} aria-hidden="true" /> Only you see this</div>
    <h1>Your engagements</h1>
    <p>Signed in as {profile.name} ({profile.email}).</p>
    <div className="notice">
      <h2>{profile.is_admin ? "Clearway admin" : "Clearway facilitator"}</h2>
      {error ? <p role="status">We couldn’t load your engagements. Please try again.</p> : engagements?.length
        ? <ul>{engagements.map(engagement => <li key={engagement.id}>{engagement.title}</li>)}</ul>
        : <p>You don’t have any engagements yet. They’ll appear here when they’re ready.</p>}
    </div>
    <form action="/auth/sign-out" method="post"><button className="button-link" type="submit">Sign out</button></form>
  </main>;
}

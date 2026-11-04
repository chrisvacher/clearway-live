import { notFound } from "next/navigation";
import { FollowupClient } from "@/components/followup/followup-client";
import { tokenShape } from "@/lib/interactions/intent-server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Follow-up remote", robots: { index: false, follow: false } };
// The link a team facilitator gets for the video follow-up: enter the code, take the remote on a phone.
export default async function FollowupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; if (!tokenShape(token)) notFound();
  return <div className="surface ctl-remote-surface" data-surface="control" data-theme="light"><FollowupClient token={token} as="remote" /></div>;
}

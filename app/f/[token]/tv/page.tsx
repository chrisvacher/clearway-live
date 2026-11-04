import { notFound } from "next/navigation";
import { FollowupClient } from "@/components/followup/followup-client";
import { tokenShape } from "@/lib/interactions/intent-server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Follow-up TV view", robots: { index: false, follow: false } };
// The same link opened on the computer shared in the video call: pairs this tab as the TV view.
export default async function FollowupTvPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; if (!tokenShape(token)) notFound();
  return <div className="surface ctl-remote-surface" data-surface="control" data-theme="light"><FollowupClient token={token} as="tv" /></div>;
}

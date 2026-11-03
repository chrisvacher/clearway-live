import type { NextRequest } from "next/server";
import { castVote, myVotes, phoneQa } from "@/lib/interactions/qa-server";

export const dynamic = "force-dynamic";
// A phone's own votes, so it can show and toggle them.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return phoneQa(request, id, client => myVotes(client, id));
}
// One press: on or off, with the vote's id and revision from the phone's outbox.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return phoneQa(request, id, (client, body) => castVote(client, id, body));
}

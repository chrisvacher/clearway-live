import type { NextRequest } from "next/server";
import { phoneQa } from "@/lib/interactions/qa-server";
import { castAgree, myAgrees } from "@/lib/interactions/four-lists-server";
import { uuid } from "@/lib/room/identity";

export const dynamic = "force-dynamic";
// An agree may wait its turn behind a room full of answers; see queuedWrite.
export const maxDuration = 60;
// A phone's own agrees on Four Helpful Lists cards, so it can show and toggle them. With ?session= it also
// returns that self-paced step's top cards, because a phone outside the live frame has no results to follow.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, session = request.nextUrl.searchParams.get("session");
  return phoneQa(request, id, async client => session !== null && !uuid(session) ? { data: { status: "invalid_request" }, status: 422 } : myAgrees(client, id, session));
}
// One press: on or off, with the agree's id and revision from the phone's outbox.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return phoneQa(request, id, (client, body) => castAgree(client, id, body));
}

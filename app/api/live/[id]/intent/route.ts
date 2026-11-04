import type { NextRequest } from "next/server";
import { phoneQa } from "@/lib/interactions/qa-server";
import { phoneIntentCall, phoneIntentView } from "@/lib/interactions/intent-server";

export const dynamic = "force-dynamic";
// A phone's commander's intent calls, under its own room sign-in: the cards and who is
// typing where (GET), and join, leave, edit and the holder's presses (POST).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return phoneQa(request, id, client => phoneIntentView(client, id));
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return phoneQa(request, id, (client, body) => phoneIntentCall(client, id, body));
}

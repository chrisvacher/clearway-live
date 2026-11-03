import type { NextRequest } from "next/server";
import { askAnyTime, phoneQa } from "@/lib/interactions/qa-server";

export const dynamic = "force-dynamic";
// Questions any time: an Ask from any session's phone, into the engagement's one pool.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return phoneQa(request, id, (client, body) => askAnyTime(client, id, body));
}

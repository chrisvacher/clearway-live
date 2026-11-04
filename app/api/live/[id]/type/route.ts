import type { NextRequest } from "next/server";
import { phoneQa } from "@/lib/interactions/qa-server";
import { typeBullet } from "@/lib/interactions/outcomes-server";

export const dynamic = "force-dynamic";
// Outcome bullets: text as it is typed (batched), and the nudge that follows a pending update.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return phoneQa(request, id, (client, body) => typeBullet(client, id, body));
}

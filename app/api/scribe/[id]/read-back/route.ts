import type { NextRequest } from "next/server";
import { scribeRoute } from "@/lib/scribe/server";
import { correctionOf } from "@/lib/interactions/read-back";

export const dynamic = "force-dynamic";
// SCR-01's correction composer. GET: the item on the TV and its lines, to the scribe only (no sources, no counts, no answers).
// POST: one correction, written once by its client-made id, so the scribe's outbox can replay it. It goes to the facilitator's queue.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return scribeRoute(request, id, async client => {
    const { data, error } = await client.rpc("read_back_scribe", { p_engagement: id });
    if (error) throw error;
    return { data, status: data.status === "ok" ? 200 : data.status === "denied" ? 403 : 404 };
  });
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return scribeRoute(request, id, async (client, _surface, _body, raw) => {
    const c = correctionOf(raw);
    if (!c) return { data: { status: "invalid_request" }, status: 422 };
    const { data, error } = await client.rpc("read_back_correct", { p_engagement: id, p_id: c.id, p_item: c.item, p_line: c.line, p_wording: c.wording, p_reason: c.reason });
    if (error) throw error;
    const status = data.status as string;
    return { data, status: ["accepted", "duplicate", "ok", "unchanged"].includes(status) ? 200 : status === "denied" ? 403 : status === "missing" ? 404 : ["conflict", "stale", "settled"].includes(status) ? 409 : 422 };
  }, true);
}

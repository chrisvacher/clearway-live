import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { roomMutation } from "@/lib/live/mutation";
import { aiControlBody } from "@/lib/interactions/ai";
import { kickAi } from "@/lib/ai/trigger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));

// Facilitator-only: the AI panel for the live step, or the step asked for.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) return answer({ status: "missing" }, 404);
  const session = request.nextUrl.searchParams.get("session");
  if (session !== null && !uuid(session)) return answer({ status: "invalid_request" }, 422);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const { data, error } = await fac.client.rpc("ai_status", { p_engagement: id, p_session: session });
  if (error) { console.error("AI status unavailable", { code: error.code }); return answer({ status: "unavailable" }, 503); }
  return answer(data, data.status === "ok" ? 200 : 403);
}

// AI on and off, Undo, Redo, Pin, Rename, Undo last AI change, Show and Hide summary.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let press: ReturnType<typeof aiControlBody>;
  try { press = aiControlBody(await limitedJson(request)); } catch { press = null; }
  if (!press) return answer({ status: "invalid_request" }, 422);
  const { id: pressId, action, p } = press;
  try {
    const { data, error } = await roomMutation(fac.client, id, () => fac.client.rpc("ai_control", { p_engagement: id, p_id: pressId, p_action: action, p }));
    if (error) throw error;
    const status = data.status as string;
    // Turning AI on or showing the summary starts the work it needs, after the response.
    if (status === "ok" && ["ai_on", "show_summary"].includes(action)) kickAi(id, p.session as string);
    return answer(data, ["ok", "duplicate", "unchanged"].includes(status) ? 200 : status === "denied" ? 403 : status === "invalid_request" ? 422 : 409);
  } catch (error) {
    console.error("AI control unavailable", { code: typeof error === "object" && error && "code" in error ? error.code : "request_failed" });
    return answer({ status: "unavailable" }, 503);
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { roomMutation } from "@/lib/live/mutation";
import { qaControlBody } from "@/lib/interactions/qa";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));

// Facilitator-only: the Q&A panel (the live Q&A step, or the Questions any time pool).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) return answer({ status: "missing" }, 404);
  const session = request.nextUrl.searchParams.get("session");
  if (session !== null && !uuid(session)) return answer({ status: "invalid_request" }, 422);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const { data, error } = await fac.client.rpc("qa_status", { p_engagement: id, p_session: session });
  if (error) { console.error("Q&A status unavailable", { code: error.code }); return answer({ status: "unavailable" }, 503); }
  return answer(data, data.status === "ok" ? 200 : 403);
}

// Spotlight, Answered, Edit, Undo fold, Hide: one press each, decided under the room lock.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let press: ReturnType<typeof qaControlBody>;
  try { press = qaControlBody(await limitedJson(request)); } catch { press = null; }
  if (!press) return answer({ status: "invalid_request" }, 422);
  const { id: pressId, action, p } = press;
  try {
    const { data, error } = await roomMutation(fac.client, id, () => fac.client.rpc("qa_control", { p_engagement: id, p_id: pressId, p_action: action, p }));
    if (error) throw error;
    const status = data.status as string;
    return answer(data, ["ok", "duplicate", "unchanged"].includes(status) ? 200 : status === "denied" ? 403 : status === "invalid_request" ? 422 : 409);
  } catch (error) {
    console.error("Q&A control unavailable", { code: typeof error === "object" && error && "code" in error ? error.code : "request_failed" });
    return answer({ status: "unavailable" }, 503);
  }
}

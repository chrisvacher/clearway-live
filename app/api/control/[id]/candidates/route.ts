import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { roomMutation } from "@/lib/live/mutation";
import { candidatePress } from "@/lib/interactions/candidates";
import { kickAi } from "@/lib/ai/trigger";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));

// D1-07 to D1-10, facilitator only. GET: the candidates with their source sentences, the suggestions
// waiting, the AI's state and the lens wall to write from by hand.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const { data, error } = await fac.client.rpc("candidates_state", { p_engagement: id });
  if (error) { console.error("Candidates state unavailable", { code: error.code }); return answer({ status: "unavailable" }, 503); }
  return answer(data, data.status === "ok" ? 200 : data.status === "denied" ? 403 : 404);
}
// One press by a client-made id. Draft asks the AI after the response has gone, never in this path.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let press: ReturnType<typeof candidatePress>;
  try { press = candidatePress(await limitedJson(request, 8192)); } catch { press = null; }
  if (!press) return answer({ status: "invalid_request" }, 422);
  try {
    const { data, error } = await roomMutation(fac.client, id, () => fac.client.rpc("candidates_control", { p_engagement: id, p_id: press.id, p_action: press.action, p: press.p }));
    if (error) throw error;
    const status = data.status as string;
    if (status === "ok" && press.action === "draft" && typeof press.p.from === "string") kickAi(id, press.p.from);
    return answer(data, ["ok", "duplicate", "unchanged"].includes(status) ? 200 : status === "denied" ? 403 : status === "invalid_request" ? 422 : 409);
  } catch (error) {
    console.error("Candidates control unavailable", { code: typeof error === "object" && error && "code" in error ? error.code : "request_failed" });
    return answer({ status: "unavailable" }, 503);
  }
}

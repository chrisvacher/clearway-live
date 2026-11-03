import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { controlBody } from "@/lib/control/policy";
import { roomMutation } from "@/lib/live/mutation";
import { kickAi } from "@/lib/ai/trigger";

export const dynamic = "force-dynamic";
// AI work runs after the response (lib/ai/trigger.ts) and may take a while; the answer never waits for it.
export const maxDuration = 60;
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));

// Facilitator-only: TV confirmations, counts, items and recent presses.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const { data, error } = await fac.client.rpc("control_status", { p_engagement: id });
  if (error) { console.error("Control status unavailable", { code: error.code }); return answer({ status: "unavailable" }, 503); }
  // The facilitator's poll also runs AI work that is due without new answers (a summary after 75 seconds).
  if (data.status === "ok") kickAi(id);
  return answer(data, data.status === "ok" ? 200 : 403);
}

// Every live control is one press: validated here, decided under the room lock.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let press: ReturnType<typeof controlBody>;
  try { press = controlBody(await limitedJson(request)); } catch { press = null; }
  if (!press) return answer({ status: "invalid_request" }, 422);
  const { id: pressId, action, p } = press;
  try {
    const { data, error } = await roomMutation(fac.client, id, () => fac.client.rpc("room_control", { p_engagement: id, p_id: pressId, p_action: action, p }));
    if (error) throw error;
    const status = data.status as string;
    return answer(data, ["ok", "duplicate", "unchanged"].includes(status) ? 200 : status === "denied" ? 403 : status === "invalid_request" ? 422 : 409);
  } catch (error) {
    console.error("Room control unavailable", { code: typeof error === "object" && error && "code" in error ? error.code : "request_failed" });
    return answer({ status: "unavailable" }, 503);
  }
}

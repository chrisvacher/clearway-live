import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { roomMutation } from "@/lib/live/mutation";
import { kindPress } from "@/lib/interactions/grid-form-sign";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));

// Milestone 3, step 3's own controls: merge a grid item into another (and undo it), and
// close signing. One press each, decided under the room lock like every live control.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let press: ReturnType<typeof kindPress>;
  try { press = kindPress(await limitedJson(request)); } catch { press = null; }
  if (!press) return answer({ status: "invalid_request" }, 422);
  const { rpc, id: pressId, action, p } = press;
  try {
    const { data, error } = await roomMutation(fac.client, id, () => fac.client.rpc(rpc, { p_engagement: id, p_id: pressId, p_action: action, p }));
    if (error) throw error;
    const status = data.status as string;
    return answer(data, ["ok", "duplicate", "unchanged"].includes(status) ? 200 : status === "denied" ? 403 : status === "invalid_request" ? 422 : 409);
  } catch (error) {
    console.error("Grid or sign control unavailable", { code: typeof error === "object" && error && "code" in error ? error.code : "request_failed" });
    return answer({ status: "unavailable" }, 503);
  }
}

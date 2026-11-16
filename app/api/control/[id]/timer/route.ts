import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { roomMutation } from "@/lib/live/mutation";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));
const actions = ["start", "start_step", "pause", "resume", "add", "reset", "stop"];

// The room's timer (TM-3), from the control surface and the phone remote. The database checks the role: the facilitator and
// a co-facilitator only.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let body: { action?: unknown; p?: unknown };
  try { body = await limitedJson(request) as typeof body; } catch { return answer({ status: "invalid_request" }, 422); }
  if (typeof body.action !== "string" || !actions.includes(body.action) || (body.p !== undefined && (typeof body.p !== "object" || body.p === null || Array.isArray(body.p)))) return answer({ status: "invalid_request" }, 422);
  try {
    const { data, error } = await roomMutation(fac.client, id, () => fac.client.rpc("timer_control", { p_engagement: id, p_action: body.action, p: body.p ?? {} }));
    if (error) throw error;
    const status = data.status as string;
    return answer(data, ["ok", "unchanged"].includes(status) ? 200 : status === "denied" ? 403 : status === "invalid_request" ? 422 : 409);
  } catch { return answer({ status: "unavailable" }, 503); }
}

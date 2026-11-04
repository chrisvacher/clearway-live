import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { roomMutation } from "@/lib/live/mutation";
import { statusCode } from "@/lib/interactions/intent-server";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));

// Who holds the remote, who could, and the follow-up access, for the lead's banner (GET).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const [remote, access, view] = await Promise.all([fac.client.rpc("team_remote_state", { p_engagement: id }), fac.client.rpc("followup_manage", { p_engagement: id, p_action: "status", p: {} }), fac.client.rpc("intent_view", { p_engagement: id })]);
  if (remote.error || access.error) return answer({ status: "unavailable" }, 503);
  return answer({ status: "ok", remote: remote.data, followup: access.data, people: view.data?.people ?? [] });
}
// Give the remote, take it back, end the block: one press each, decided under the room lock.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let body: Record<string, unknown>;
  try { body = await limitedJson(request); } catch { return answer({ status: "invalid_request" }, 422); }
  const p = body.p && typeof body.p === "object" && !Array.isArray(body.p) ? body.p : null;
  if (!uuid(body.id) || typeof body.action !== "string" || !p) return answer({ status: "invalid_request" }, 422);
  try {
    const { data, error } = await roomMutation(fac.client, id, () => fac.client.rpc("handover_control", { p_engagement: id, p_id: body.id, p_action: body.action, p }));
    if (error) throw error;
    return answer(data, statusCode(data.status));
  } catch { return answer({ status: "unavailable" }, 503); }
}

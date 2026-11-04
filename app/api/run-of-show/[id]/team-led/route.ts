import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { roomMutation } from "@/lib/live/mutation";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));
// Mark a run-of-show step team-led (or not). While a team-led step is live the scribe console is off.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let session: string, value: boolean;
  try { const body = await limitedJson(request, 1024); if (!uuid(body.session) || typeof body.value !== "boolean") throw new Error("Invalid"); session = body.session; value = body.value; }
  catch { return answer({ status: "invalid_request" }, 422); }
  try {
    const { data, error } = await roomMutation(fac.client, id, () => fac.client.rpc("session_team_led", { p_engagement: id, p_session: session, p_value: value }));
    if (error) throw new Error("save");
    return answer(data, data.status === "ok" ? 200 : data.status === "denied" ? 403 : data.status === "not_found" ? 404 : data.status === "closed" ? 409 : 422);
  } catch { return answer({ status: "unavailable" }, 503); }
}

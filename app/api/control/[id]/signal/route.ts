import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { roomMutation } from "@/lib/live/mutation";
import { signalBody } from "@/lib/interactions/signal";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));

// Facilitator-only (the lead and a co-facilitator): the alignment signal's cards for the live step, or the step asked for.
// The database checks the role again; a participant, the scribe, a TV and a team facilitator are denied there.
const missing = (error: unknown) => typeof error === "object" && error !== null && "code" in error && (error.code === "PGRST202" || error.code === "42883");

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) return answer({ status: "missing" }, 404);
  const session = request.nextUrl.searchParams.get("session");
  if (session !== null && !uuid(session)) return answer({ status: "invalid_request" }, 422);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const { data, error } = await fac.client.rpc("signal_state", { p_engagement: id, p_session: session });
  // Before the migration the function is missing (404): the panel and the remote stay quiet. Any other failure is a 503 and they keep what they last read.
  if (error) return answer({ status: "unavailable" }, missing(error) ? 404 : 503);
  return answer(data, data.status === "ok" ? 200 : 403);
}

// Dismiss, Save as a citation, Ask the room, Back to the session.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let press: ReturnType<typeof signalBody>;
  try { press = signalBody(await limitedJson(request)); } catch { press = null; }
  if (!press) return answer({ status: "invalid_request" }, 422);
  try {
    const { data, error } = await roomMutation(fac.client, id, () => fac.client.rpc("signal_act", { p_engagement: id, p_id: press.id, p_signal: press.signal, p_action: press.action, p: press.p }));
    if (error) throw error;
    const status = data.status as string;
    return answer(data, ["ok", "duplicate", "unchanged"].includes(status) ? 200 : status === "denied" ? 403 : ["invalid_request", "filtered", "names_signal"].includes(status) ? 422 : 409);
  } catch (error) {
    console.error("Signal press unavailable", { code: typeof error === "object" && error && "code" in error ? error.code : "request_failed" });
    return answer({ status: "unavailable" }, 503);
  }
}

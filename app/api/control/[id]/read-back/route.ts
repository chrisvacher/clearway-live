import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { roomMutation } from "@/lib/live/mutation";
import { readBackPress } from "@/lib/interactions/read-back";
import { kickAi } from "@/lib/ai/trigger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));

// D2-03 and INT-14, facilitator only. GET: the items, the item on show with its lines, sources and versions, the tally, the
// "It needs a change" texts and the "What's missing?" answers (anonymous), the correction queue with the scribe's reasons,
// the AI and the overnight publication. Nothing here reaches the TV or a phone.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const { data, error } = await fac.client.rpc("read_back_state", { p_engagement: id });
  if (error) { console.error("Read-back state unavailable", { code: error.code }); return answer({ status: "unavailable" }, 503); }
  return answer(data, data.status === "ok" ? 200 : data.status === "denied" ? 403 : 404);
}
// Previous, Next, a chip, Reload items, a correction, Accept, Edit and accept, Dismiss, Undo the last fold, Mark a decision, Take back
// to the screen, AI on or off. One press by a client-made id.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let press: ReturnType<typeof readBackPress>;
  try { press = readBackPress(await limitedJson(request, 8192)); } catch { press = null; }
  if (!press) return answer({ status: "invalid_request" }, 422);
  try {
    const { data, error } = await roomMutation(fac.client, id, () => fac.client.rpc("read_back_control", { p_engagement: id, p_id: press.id, p_action: press.action, p: press.p }));
    if (error) throw error;
    const status = data.status as string;
    // A fold the AI is asked for runs after the response, never before it.
    if (status === "ok" && ["accept", "ai_on", "undo", "show"].includes(press.action)) kickAi(id, press.session);
    return answer(data, ["ok", "duplicate", "unchanged"].includes(status) ? 200 : status === "denied" ? 403 : ["invalid_request", "filtered", "too_many", "invalid_state"].includes(status) ? 422 : 409);
  } catch (error) {
    console.error("Read-back control unavailable", { code: typeof error === "object" && error && "code" in error ? error.code : "request_failed" });
    return answer({ status: "unavailable" }, 503);
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { roomMutation } from "@/lib/live/mutation";
import { summaryPress } from "@/lib/interactions/lens-summary";
import { kickAi } from "@/lib/ai/trigger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));

// INT-18, facilitator only. GET: the five lenses, the summary on show with each line's sources, the suggestions,
// every version, the editing lock, the AI and the decision. Nothing here reaches the TV or a phone.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const { data, error } = await fac.client.rpc("lens_summary_state", { p_engagement: id });
  if (error) { console.error("Lens summary state unavailable", { code: error.code }); return answer({ status: "unavailable" }, 503); }
  return answer(data, data.status === "ok" ? 200 : data.status === "denied" ? 403 : 404);
}
// Show a lens, edit a line, Undo, Fold in now, Hold, Write it again, AI on or off, Mark a decision. One press by a client-made id.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let press: ReturnType<typeof summaryPress>;
  try { press = summaryPress(await limitedJson(request, 8192)); } catch { press = null; }
  if (!press) return answer({ status: "invalid_request" }, 422);
  try {
    const { data, error } = await roomMutation(fac.client, id, () => fac.client.rpc("lens_summary_control", { p_engagement: id, p_id: press.id, p_action: press.action, p: press.p }));
    if (error) throw error;
    const status = data.status as string;
    // The work these presses ask for runs after the response, never before it.
    if (status === "ok" && ["show", "edit_done", "fold_now", "release", "redraft", "ai_on", "undo"].includes(press.action)) kickAi(id, press.session);
    return answer(data, ["ok", "duplicate", "unchanged"].includes(status) ? 200 : status === "denied" ? 403 : ["invalid_request", "filtered"].includes(status) ? 422 : 409);
  } catch (error) {
    console.error("Lens summary control unavailable", { code: typeof error === "object" && error && "code" in error ? error.code : "request_failed" });
    return answer({ status: "unavailable" }, 503);
  }
}

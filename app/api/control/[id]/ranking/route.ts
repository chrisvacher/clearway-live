import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { roomMutation } from "@/lib/live/mutation";
import { rankingControlBody } from "@/lib/interactions/bars";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));

// INT-06 Add an option, facilitator only: the live ranking's suggestions, matched by words.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const { data, error } = await fac.client.rpc("ranking_suggestions_for", { p_engagement: id });
  if (error) { console.error("Ranking suggestions unavailable", { code: error.code }); return answer({ status: "unavailable" }, 503); }
  return answer(data, data.status === "ok" ? 200 : 403);
}

// Add a suggestion (merging its group) to every phone and the TV, or dismiss it. One press,
// decided under the room lock, by its client-made id.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let press: ReturnType<typeof rankingControlBody>;
  try { press = rankingControlBody(await limitedJson(request, 16384)); } catch { press = null; }
  if (!press) return answer({ status: "invalid_request" }, 422);
  try {
    const { data, error } = await roomMutation(fac.client, id, () => fac.client.rpc("ranking_control", { p_engagement: id, p_id: press.id, p_action: press.action, p: { ids: press.ids, text: press.text } }));
    if (error) throw error;
    const status = data.status as string;
    return answer(data, ["ok", "duplicate"].includes(status) ? 200 : status === "denied" ? 403 : status === "invalid_request" ? 422 : 409);
  } catch (error) {
    console.error("Ranking control unavailable", { code: typeof error === "object" && error && "code" in error ? error.code : "request_failed" });
    return answer({ status: "unavailable" }, 503);
  }
}

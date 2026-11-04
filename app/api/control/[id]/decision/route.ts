import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { roomMutation } from "@/lib/live/mutation";
import { decisionBody } from "@/lib/wayfinding/decision";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));

// The decisions already marked, newest first. Facilitator only.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const { data, error } = await fac.client.rpc("decisions_for", { p_engagement: id });
  if (error) { console.error("Decisions unavailable", { code: error.code }); return answer({ status: "unavailable" }, 503); }
  return answer(data, data.status === "ok" ? 200 : 403);
}

// Mark a decision: one press, decided under the room lock, by its client-made id.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let mark: ReturnType<typeof decisionBody>;
  try { mark = decisionBody(await limitedJson(request, 8192)); } catch { mark = null; }
  if (!mark) return answer({ status: "invalid_request" }, 422);
  try {
    const { id: markId, ...rest } = mark;
    const { data, error } = await roomMutation(fac.client, id, () => fac.client.rpc("decision_mark", { p_engagement: id, p_id: markId, p: rest }));
    if (error) throw error;
    const status = data.status as string;
    return answer(data, ["ok", "duplicate"].includes(status) ? 200 : status === "denied" ? 403 : status === "invalid_request" ? 422 : status === "missing" ? 404 : 409);
  } catch (error) {
    console.error("Mark a decision unavailable", { code: typeof error === "object" && error && "code" in error ? error.code : "request_failed" });
    return answer({ status: "unavailable" }, 503);
  }
}

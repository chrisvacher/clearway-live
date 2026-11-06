import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { roomMutation } from "@/lib/live/mutation";
import { reviewPress } from "@/lib/interactions/four-lists";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));

// SET-05, facilitator only. GET: every card of the step with its agreement count, edits, merges and marks.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, session = request.nextUrl.searchParams.get("session");
  if (!uuid(id) || !uuid(session)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const { data, error } = await fac.client.rpc("four_lists_review_read", { p_engagement: id, p_session: session });
  if (error) { console.error("Four lists review unavailable", { code: error.code }); return answer({ status: "unavailable" }, 503); }
  return answer(data, data.status === "ok" ? 200 : data.status === "denied" ? 403 : 404);
}
// One review press: edit, keep or set aside, merge, unmerge, or mark which cards feed What We Heard and Strategic Tensions.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let press: ReturnType<typeof reviewPress>;
  try { press = reviewPress(await limitedJson(request, 8192)); } catch { press = null; }
  if (!press) return answer({ status: "invalid_request" }, 422);
  try {
    const { data, error } = await roomMutation(fac.client, id, () => fac.client.rpc("four_lists_review", { p_engagement: id, p_session: press.session, p_action: press.action, p: press.p }));
    if (error) throw error;
    const status = data.status as string;
    return answer(data, status === "ok" ? 200 : status === "denied" ? 403 : status === "invalid_request" || status === "filtered" ? 422 : status === "missing" ? 404 : 409);
  } catch (error) {
    console.error("Four lists review unavailable", { code: typeof error === "object" && error && "code" in error ? error.code : "request_failed" });
    return answer({ status: "unavailable" }, 503);
  }
}

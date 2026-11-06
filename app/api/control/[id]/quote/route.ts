import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { roomMutation } from "@/lib/live/mutation";
import { quoteBody } from "@/lib/quote/promoted";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));
const code = (status: string) => ["ok", "unchanged"].includes(status) ? 200 : status === "denied" ? 403 : status === "not_found" ? 404 : ["nothing_live", "team_led"].includes(status) ? 409 : 422;

// Promote a scribe quote to the TV, or take it down. Facilitators only (the control surface and the
// remote). Decided under the room lock, so two presses together leave one quote; a repeat changes nothing.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let body: ReturnType<typeof quoteBody>;
  try { body = quoteBody(await limitedJson(request, 1024)); } catch { body = null; }
  if (!body) return answer({ status: "invalid_request" }, 422);
  try {
    const { data, error } = await roomMutation(fac.client, id, () => body.action === "promote"
      ? fac.client.rpc("quote_promote", { p_engagement: id, p_card: body.card }) : fac.client.rpc("quote_take_down", { p_engagement: id }));
    if (error) throw error;
    return answer(data, code(data.status as string));
  } catch (error) {
    console.error("Promoting a quote unavailable", { code: typeof error === "object" && error && "code" in error ? error.code : "request_failed" });
    return answer({ status: "unavailable" }, 503);
  }
}

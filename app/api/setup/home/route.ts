import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { uuid } from "@/lib/room/policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const answer = (data: Record<string, unknown>, status = 200) => privateResponse(NextResponse.json(data, { status }));
const words: Record<string, string> = {
  denied: "You can’t change this engagement’s Home screen.", closed: "This engagement has closed.", missing: "That loop isn’t in the run of show any more. Reload the page.",
};
// Which loop is the engagement's Home, and the loops it could be.
export async function GET(request: NextRequest) {
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const engagement = request.nextUrl.searchParams.get("engagement");
  if (!uuid(engagement)) return answer({ status: "invalid_request" }, 400);
  const { data, error } = await fac.client.rpc("home_list", { p_engagement: engagement });
  if (error) return answer({ status: "unavailable" }, 503);
  return answer(data, data.status === "ok" ? 200 : 403);
}
// Choose a loop as Home, or none (the usual holding screen).
export async function POST(request: NextRequest) {
  const config = authConfig(); if (!config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return answer({ status: "invalid_request" }, 400); }
  if (!uuid(body.engagement) || (body.session !== null && !uuid(body.session))) return answer({ status: "invalid_request" }, 400);
  const { data, error } = await fac.client.rpc("home_choose", { p_engagement: body.engagement, p_session: body.session });
  if (error) return answer({ status: "unavailable", message: "We couldn’t change the Home screen. Please try again." }, 503);
  return answer(data.status === "ok" ? data : { status: data.status, message: words[data.status] ?? "We couldn’t change the Home screen." }, data.status === "ok" ? 200 : 400);
}

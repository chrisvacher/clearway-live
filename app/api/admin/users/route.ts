import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";

function answer(status: string, code = 200) {
  return privateResponse(NextResponse.json({ status }, { status: code }));
}

export async function POST(request: NextRequest) {
  const config = authConfig();
  if (!config || !sameOrigin(request, config.origin)) return answer("denied", 403);
  const fac = await getFacilitator();
  if (!fac?.profile.is_admin) return answer("denied", 403);
  const body = await limitedJson(request, 2048).catch(() => null);
  if (!body || !uuid(body.user) || !["make_admin", "make_facilitator", "remove"].includes(String(body.action))) return answer("invalid_request", 400);
  const { data, error } = await fac.client.rpc("clearway_user_admin_change", { p_user: body.user, p_action: body.action });
  if (error || typeof data !== "string") return answer("unavailable", 503);
  return answer(data, data === "ok" ? 200 : data === "denied" ? 403 : data === "missing" ? 404 : 409);
}

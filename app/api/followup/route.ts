import { NextResponse, type NextRequest } from "next/server";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { serviceClient } from "@/lib/server/supabase";
import { parseDevice, hash } from "@/lib/room/policy";
import { codeHash, grantCookie, grantHash, newGrantSecret, statusCode, tokenHash, tokenShape } from "@/lib/interactions/intent-server";
import { normalizeCode, validCode, isTeamPress, isId } from "@/lib/interactions/intent";

export const dynamic = "force-dynamic";

// The team facilitator's calls, with no Clearway sign-in. The link names the access and the code
// proves the person; a grant, held in an HttpOnly cookie, is what every later call carries. The
// database checks the grant, the window and the block on every call.
export async function POST(request: NextRequest) {
  const config = authConfig();
  const out = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));
  if (!config || !sameOrigin(request, config.origin)) return out({ status: "denied" }, 403);
  let body: Record<string, unknown>;
  try { body = await limitedJson(request, 4096); } catch { return out({ status: "invalid_request" }, 422); }
  const as = body.as === "tv" ? "tv" : "remote", cookieName = grantCookie(as), action = body.action;
  const db = serviceClient();
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(name, args);
    if (error) throw error;
    return data as Record<string, unknown>;
  };
  try {
    if (action === "enter") {
      if (!tokenShape(body.token)) return out({ status: "invalid" }, 422);
      const code = normalizeCode(body.code);
      if (!validCode(code)) return out({ status: "wrong" }, 422);
      const grant = newGrantSecret();
      const data = await rpc("followup_enter", { p_token_hash: tokenHash(body.token), p_code_hash: codeHash(body.token, code), p_grant_hash: grantHash(grant) });
      const response = out(data, data.status === "ok" ? 200 : data.status === "wrong" ? 401 : statusCode(data.status));
      if (data.status === "ok") {
        const until = typeof data.closes_at === "string" ? new Date(data.closes_at).getTime() : Date.now() + 3600_000;
        response.cookies.set(cookieName, grant, { httpOnly: true, secure: config.secure, sameSite: "lax", path: "/", maxAge: Math.max(60, Math.min(86400, Math.floor((until - Date.now()) / 1000))) });
      }
      return response;
    }
    const grant = request.cookies.get(cookieName)?.value;
    if (!grant || !/^[a-f0-9]{64}$/.test(grant)) return out({ status: "denied" }, 401);
    const g = grantHash(grant);
    if (action === "check" || action === "snapshot") return out(await rpc(action === "check" ? "followup_check" : "followup_snapshot", { p_grant_hash: g }));
    if (action === "take") { const d = await rpc("followup_take_remote", { p_grant_hash: g }); return out(d, statusCode(d.status)); }
    if (action === "ask") { const d = await rpc("followup_ask", { p_grant_hash: g }); return out(d, statusCode(d.status)); }
    if (action === "pair_tv") {
      // The tab's own TV device cookie proves this browser is the one that will show the screen.
      const device = parseDevice(request.cookies.get("cw-tv-device")?.value);
      if (!device) return out({ status: "invalid_request" }, 422);
      const d = await rpc("followup_pair_tv", { p_grant_hash: g, p_device: device.id, p_proof: hash(device.secret) });
      return out(d, statusCode(d.status));
    }
    if (action === "press") {
      const press = body.press && typeof body.press === "object" && !Array.isArray(body.press) ? body.press as Record<string, unknown> : null;
      if (!press || !isId(press.id) || typeof press.action !== "string" || !isTeamPress(press.action) || !press.p || typeof press.p !== "object" || Array.isArray(press.p)) return out({ status: "invalid_request" }, 422);
      const d = await rpc("followup_press", { p_grant_hash: g, p_id: press.id, p_action: press.action, p: press.p });
      return out(d, statusCode(d.status));
    }
    return out({ status: "invalid_request" }, 422);
  } catch (error) {
    console.error("Follow-up unavailable", { code: typeof error === "object" && error && "code" in error ? error.code : "request_failed" });
    return out({ status: "unavailable" }, 503);
  }
}

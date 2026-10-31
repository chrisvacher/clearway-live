import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { digest, uuid } from "@/lib/room/policy";
import { pairingCode } from "@/lib/tv/policy";
import { roomMutation } from "@/lib/live/mutation";
export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const { data, error } = await fac.client.rpc("tv_manage", { p_engagement: id, p_action: "list", p: {} });
  return error ? answer({ status: "unavailable" }, 503) : answer(data, data.status === "ok" ? 200 : 403);
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let action: string, p: Record<string, unknown>;
  try {
    const body = await limitedJson(request); action = String(body.action);
    if (action === "pair") {
      const code = pairingCode(body.code), secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
      if (!code || !secret || typeof body.label !== "string" || !body.label.trim() || body.label.trim().length > 80) return answer({ status: "invalid_request" }, 422);
      p = { code_hash: digest(secret, "tv-pair", code), label: body.label.trim() };
    } else if (action === "unpair" && uuid(body.device)) p = { device: body.device };
    else if (action === "screen" && ["holding", "join", "screen_check"].includes(String(body.content))) p = { content: body.content };
    else if (action === "display" && ["very_small", "small", "medium", "large", "very_large"].includes(String(body.room_size)) && ["dark", "light"].includes(String(body.theme)) && typeof body.texture === "boolean" && typeof body.reduced_motion === "boolean") p = { room_size: body.room_size, theme: body.theme, texture: body.texture, reduced_motion: body.reduced_motion };
    else return answer({ status: "invalid_request" }, 422);
  } catch { return answer({ status: "invalid_request" }, 422); }
  const { data, error } = await roomMutation(fac.client, id, () => fac.client.rpc("tv_manage", { p_engagement: id, p_action: action, p }));
  if (error) console.error("TV settings unavailable", { code: error.code });
  return error ? answer({ status: "unavailable" }, 503) : answer(data, data.status === "ok" ? 200 : ["denied"].includes(data.status) ? 403 : data.status === "limited" ? 429 : 409);
}

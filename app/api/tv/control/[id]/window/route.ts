import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { digest, uuid } from "@/lib/room/policy";
import { roomOrigin, skinOf } from "@/lib/brand";
import { newPairToken, tvLinkAddress } from "@/lib/tv/pair-link";
export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));
// A facilitator of this engagement asks for a single-use link that pairs a TV window on the same laptop. The token is
// returned once, in the address to open; only its keyed hash is stored.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig(), secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  if (!secret) return answer({ status: "unavailable" }, 503);
  const token = newPairToken();
  const { data, error } = await fac.client.rpc("tv_pair_link", { p_engagement: id, p_token_hash: digest(secret, "tv-pair-link", token) });
  if (error) { console.error("TV window unavailable", { code: error.code }); return answer({ status: "unavailable" }, 503); }
  if (data.status !== "ok") return answer({ status: data.status }, data.status === "denied" ? 403 : data.status === "limited" ? 429 : data.status === "closed" ? 409 : 422);
  return answer({ status: "ok", url: tvLinkAddress(roomOrigin(skinOf(data.skin)), token) });
}

import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { phoneIntentCall, phoneIntentView } from "@/lib/interactions/intent-server";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));

// The facilitator's pair assignment and card calls, and the cards with who is on each.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  try { const out = await phoneIntentView(fac.client, id); return answer(out.data, out.status); }
  catch { return answer({ status: "unavailable" }, 503); }
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let body: Record<string, unknown> | null = null;
  try { body = await limitedJson(request); } catch { return answer({ status: "invalid_request" }, 422); }
  try { const out = await phoneIntentCall(fac.client, id, body, true); return answer(out.data, out.status); }
  catch { return answer({ status: "unavailable" }, 503); }
}

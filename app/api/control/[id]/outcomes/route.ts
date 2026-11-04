import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { roomMutation } from "@/lib/live/mutation";
import { pressBody, pressStatusCode, type OutcomePress } from "@/lib/interactions/outcomes";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));

// Outcome confirm, facilitator only: what the room said (counts, reasons, suggested names, never who).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const { data, error } = await fac.client.rpc("confirm_for", { p_engagement: id });
  if (error) { console.error("Outcome confirm unavailable", { code: error.code }); return answer({ status: "unavailable" }, 503); }
  return answer(data, data.status === "ok" ? 200 : 403);
}

// One press, decided under the room lock by its client-made id: show an outcome, fix a bullet,
// record the room's decision on an outcome (Mark a decision), or save its description and what we will stop.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let press: OutcomePress | null;
  try { press = pressBody(await limitedJson(request, 8192)); } catch { press = null; }
  if (!press) return answer({ status: "invalid_request" }, 422);
  const call = press.kind === "bullets"
    ? () => fac.client.rpc("bullet_control", { p_engagement: id, p_id: press.id, p_action: press.action, p: press.action === "show" ? { outcome: press.outcome } : { bullet: (press as { bullet: string }).bullet, text: (press as { text: string }).text } })
    : () => fac.client.rpc("confirm_control", { p_engagement: id, p_id: press.id, p_action: press.action === "decide" ? "decide" : "details", p: confirmParams(press) });
  try {
    const { data, error } = await roomMutation(fac.client, id, call);
    if (error) throw error;
    return answer(data, pressStatusCode(data.status as string));
  } catch (error) {
    console.error("Outcome control unavailable", { code: typeof error === "object" && error && "code" in error ? error.code : "request_failed" });
    return answer({ status: "unavailable" }, 503);
  }
}

function confirmParams(press: OutcomePress) {
  if (press.kind !== "confirm") return {};
  const base: Record<string, unknown> = { outcome: press.outcome };
  if (press.description !== undefined) base.description = press.description;
  if (press.stop !== undefined) base.stop = press.stop;
  if (press.action === "decide") { base.kind = press.decision; if (press.name !== undefined) base.name = press.name; base.reasons = press.reasons ?? ""; }
  return base;
}

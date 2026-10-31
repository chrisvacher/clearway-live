import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { sessionInput } from "@/lib/run-of-show/policy";
import { readShow } from "@/lib/run-of-show/server";
import { parts } from "@/lib/run-of-show/types";
import { roomMutation } from "@/lib/live/mutation";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid(id)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  try {
    const show = await readShow(fac.client, id);
    return show ? answer({ status: "ok", ...show }) : answer({ status: "denied" }, 403);
  } catch { return answer({ status: "unavailable" }, 503); }
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let action: string, input: unknown;
  try {
    const body = await limitedJson(request, 262144); action = String(body.action);
    if (action === "save") input = sessionInput(body.input);
    else if (action === "remove") {
      const v = body.input as Record<string, unknown>;
      if (!v || !uuid(v.id) || !Number.isInteger(v.revision) || Number(v.revision) < 0) throw new Error("Reload the session before removing it.");
      input = { id: v.id, revision: v.revision };
    } else if (action === "reorder") {
      const v = body.input as { part: string; order: { id: string; revision: number }[] };
      if (!v || !parts.includes(v.part as typeof parts[number]) || !Array.isArray(v.order) || v.order.length > 5000
        || v.order.some(x => !x || !uuid(x.id) || !Number.isInteger(x.revision) || x.revision < 0)) throw new Error("Reload the run of show before moving sessions.");
      input = { part: v.part, order: v.order.map(x => ({ id: x.id, revision: x.revision })) };
    } else throw new Error("Choose a session action.");
  } catch (error) { return answer({ status: "invalid_request", message: error instanceof Error ? error.message : "Check the session details." }, 422); }
  try {
    const { data, error } = await roomMutation(fac.client, id, () => fac.client.rpc("show_write", { p_engagement: id, p_action: action, p_input: input }));
    if (error) throw new Error("save");
    return answer(data, data.status === "ok" ? 200 : data.status === "denied" ? 403 : ["conflict", "running", "closed"].includes(data.status) ? 409 : 422);
  } catch { return answer({ status: "unavailable" }, 503); }
}

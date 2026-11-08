import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { SLOW_AFTER_MS, planBody, planMessage } from "@/lib/plan/policy";
import { kickPlan } from "@/lib/ai/trigger";
import { aiClient } from "@/lib/ai/client";

export const dynamic = "force-dynamic";
// Drafting runs after the response that starts it and may take a while.
export const maxDuration = 300;
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));
const okay = ["ok", "duplicate", "unchanged"];
const code = (status: string) => okay.includes(status) ? 200 : status === "denied" ? 403 : status === "not_found" ? 404 : status === "invalid_request" ? 422 : 409;
const reply = (data: { status: string } & Record<string, unknown>) => answer({ ...data, ...(okay.includes(data.status) ? {} : { message: planMessage(data.status) }) }, code(data.status));
// The kit shortens "taking longer than usual"; nothing else reads this.
const slowAfter = () => { const n = Number(process.env.CLEARWAY_AI_PLAN_SLOW_MS); return Number.isFinite(n) && n >= 1000 && n <= 600000 ? n : SLOW_AFTER_MS; };

// The visibility plan for one engagement: the lead and co-facilitators only, under their own sign-in. The functions check the role again.
// If the functions are not in the database yet, this says "missing" and the After hub leaves the link out.
//   GET            the plan's state (and runs the drafting worker if it is due)
//   GET ?probe=1   whether the plan is here at all (no work is started)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid(id)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  try {
    const { data, error } = await fac.client.rpc("visibility_plan_state", { p_engagement: id });
    if (error) return answer({ status: "missing" });
    if (new URL(request.url).searchParams.get("probe")) return answer({ status: data?.status === "ok" ? "ok" : String(data?.status ?? "denied") });
    if (data?.status === "ok") kickPlan(id);
    return data?.status === "ok" ? answer({ ...data, slow_after_ms: slowAfter() }) : reply(data);
  } catch { return answer({ status: "unavailable", message: "The visibility plan isn't available right now. Try again." }, 503); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let body: ReturnType<typeof planBody>;
  try { body = planBody(await limitedJson(request, 16384)); } catch { body = null; }
  if (!body) return answer({ status: "invalid_request", message: planMessage("invalid_request") }, 422);
  if ("error" in body) return answer({ status: "invalid_request", message: body.error }, 422);
  // Without a model to ask, a draft would sit pending: say so instead.
  if (body.action === "draft" && !aiClient()) return reply({ status: "ai_unavailable" });
  try {
    let data: { status: string } & Record<string, unknown>;
    const run = async (name: string, args: Record<string, unknown>) => { const r = await fac.client.rpc(name, { p_engagement: id, ...args }); if (r.error) throw r.error; return r.data as typeof data; };
    switch (body.action) {
      case "set": data = await run("visibility_plan_set", { p_moment: body.moment, p_date: body.date }); break;
      case "draft": data = await run("visibility_plan_start", { p_id: body.id, p_confirm: body.confirm }); break;
      case "edit": data = await run("visibility_plan_row_edit", { p_row: body.row, p_patch: body.cells }); break;
      case "add": data = await run("visibility_plan_row_add", { p_row: body.cells }); break;
      case "remove": data = await run("visibility_plan_row_remove", { p_row: body.row }); break;
      case "move": data = await run("visibility_plan_row_move", { p_row: body.row, p_direction: body.direction }); break;
      case "reviewed": data = await run("visibility_plan_row_reviewed", { p_row: body.row, p_reviewed: true }); break;
      default: data = await run("visibility_plan_row_reviewed", { p_row: body.row, p_reviewed: false });
    }
    // Starting a draft runs it after this response.
    if (body.action === "draft" && data.status === "ok") kickPlan(id, true);
    return reply(data);
  } catch { return answer({ status: "unavailable", message: "The visibility plan isn't available right now. Try again." }, 503); }
}

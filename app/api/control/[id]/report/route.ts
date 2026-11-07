import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { SLOW_AFTER_MS, reportBody, reportMessage } from "@/lib/report/policy";
import { kickReport } from "@/lib/ai/trigger";
import { aiClient } from "@/lib/ai/client";

export const dynamic = "force-dynamic";
// Drafting runs after the response that starts it, one section at a time, and may take a while.
export const maxDuration = 300;
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));
const okay = ["ok", "duplicate", "unchanged"];
const code = (status: string) => okay.includes(status) ? 200 : status === "denied" ? 403 : status === "not_found" ? 404 : ["invalid_request", "no_room_words", "not_a_source"].includes(status) ? 422 : 409;
const reply = (data: { status: string } & Record<string, unknown>) => answer({ ...data, ...(okay.includes(data.status) ? {} : { message: reportMessage(data.status) }) }, code(data.status));
// The kit shortens "taking longer than usual"; nothing else reads this.
const slowAfter = () => { const n = Number(process.env.CLEARWAY_AI_REPORT_SLOW_MS); return Number.isFinite(n) && n >= 1000 && n <= 600000 ? n : SLOW_AFTER_MS; };

// The report for one engagement: the lead and co-facilitators only, under their own sign-in. The functions check the role again.
// If the functions are not in the database yet, this says "missing" and the control surface leaves the link out.
//   GET                     the report's state (and runs the drafting worker if it is due)
//   GET ?probe=1            whether the report is here at all (no work is started)
//   GET ?candidates=<id>    the records a section can cite, for Add a source
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid(id)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const url = new URL(request.url), candidates = url.searchParams.get("candidates");
  try {
    if (candidates !== null) {
      if (!uuid(candidates)) return answer({ status: "invalid_request", message: reportMessage("invalid_request") }, 422);
      const { data, error } = await fac.client.rpc("report_candidates", { p_engagement: id, p_section: candidates });
      if (error) return answer({ status: "missing" });
      return data?.status === "ok" ? answer(data) : reply(data);
    }
    const { data, error } = await fac.client.rpc("report_state", { p_engagement: id });
    if (error) return answer({ status: "missing" });
    if (url.searchParams.get("probe")) return answer({ status: data?.status === "ok" ? "ok" : String(data?.status ?? "denied") });
    if (data?.status === "ok") kickReport(id);
    return data?.status === "ok" ? answer({ ...data, slow_after_ms: slowAfter() }) : reply(data);
  } catch { return answer({ status: "unavailable", message: "The report isn't available right now. Try again." }, 503); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let body: ReturnType<typeof reportBody>;
  try { body = reportBody(await limitedJson(request, 16384)); } catch { body = null; }
  if (!body) return answer({ status: "invalid_request", message: reportMessage("invalid_request") }, 422);
  if ("error" in body) return answer({ status: "invalid_request", message: body.error }, 422);
  // Without a model to ask, a draft would sit pending: say so instead.
  if (body.action === "draft" && !aiClient()) return reply({ status: "ai_unavailable" });
  const e = { p_engagement: id };
  try {
    let data: { status: string } & Record<string, unknown>;
    const run = async (name: string, args: Record<string, unknown>) => { const r = await fac.client.rpc(name, { ...e, ...args }); if (r.error) throw r.error; return r.data as typeof data; };
    switch (body.action) {
      case "draft": data = await run("report_start", { p_id: body.id, p_scope: body.scope, p_section: body.section ?? null, p_confirm: body.confirm }); break;
      case "refresh": data = await run("report_refresh", { p_section: body.section, p_confirm: body.confirm }); break;
      case "edit": data = await run("report_edit", { p_sentence: body.sentence, p_text: body.text }); break;
      case "add": data = await run("report_add", { p_section: body.section, p_text: body.text }); break;
      case "remove": data = await run("report_remove", { p_sentence: body.sentence }); break;
      case "room_words": data = await run("report_room_words", { p_sentence: body.sentence }); break;
      case "undo_room_words": data = await run("report_undo_room_words", { p_sentence: body.sentence }); break;
      case "source": data = await run("report_source_set", { p_sentence: body.sentence, p_kind: body.kind, p_ref: body.ref, p_excerpt: body.excerpt, p_add: body.add }); break;
      case "reviewed": data = await run("report_mark_reviewed", { p_section: body.section, p_reviewed: body.reviewed }); break;
      default: data = await run("report_sign_off", { p_id: body.id });
    }
    // Starting a draft runs it after this response.
    if (body.action === "draft" && data.status === "ok") kickReport(id, true);
    return reply(data);
  } catch { return answer({ status: "unavailable", message: "The report isn't available right now. Try again." }, 503); }
}

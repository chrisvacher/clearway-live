import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { readShow } from "@/lib/run-of-show/server";
import { aiClient } from "@/lib/ai/client";
import { draftWorkshopSummary } from "@/lib/ai/workshop-summary";
import { skinOf } from "@/lib/brand";
import { buildSummaryDocx } from "@/lib/export/summary-docx";
import type { Recap } from "@/lib/export/recap";
import { editedBody, paragraphsOf, summaryInputs, summaryMessage, type SummaryState } from "@/lib/workshop/summary";

// Node runtime: the Word file is built with the docx package. A draft is one model call, made while the facilitator waits.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));
const refuse = (status: string, code = 409) => answer({ status, message: summaryMessage(status) }, code);
const unavailable = () => answer({ status: "unavailable", message: summaryMessage("unavailable") }, 503);

// GET reads the summary. GET ?format=docx downloads it as a Word file. The lead and co-facilitators and an admin only: the database
// checks the role. If the summary's functions are not in the database yet, this says "missing" and the page leaves the card out.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid(id)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  try {
    const { data, error } = await fac.client.rpc("workshop_summary_state", { p_engagement: id });
    if (error) return answer({ status: error.code === "42501" ? "denied" : "missing" }, error.code === "42501" ? 403 : 200);
    const state = data as SummaryState | { status: string };
    if (new URL(request.url).searchParams.get("format") !== "docx") return answer(state, state.status === "ok" ? 200 : 404);
    if (state.status !== "ok" || !("summary" in state) || !state.summary) return answer({ status: "no_summary", message: "There is no summary yet. Draft or write one first." }, 409);
    const show = await readShow(fac.client, id); if (!show) return answer({ status: "denied" }, 403);
    const dates = await fac.client.from("engagements").select("retreat_start_date,skin").eq("id", id).maybeSingle();
    const day = dates.data?.retreat_start_date as string | null | undefined;
    const date = day ? new Intl.DateTimeFormat("en-CA", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`)) : "";
    const body = await buildSummaryDocx({ church: show.context.church, title: show.context.title, date, paragraphs: paragraphsOf(state.summary.body), skin: skinOf(dates.data?.skin) });
    const name = `${show.context.church} ${show.context.title} summary.docx`.replace(/[\\/:*?"<>|]/g, "");
    return privateResponse(new NextResponse(new Uint8Array(body), { status: 200, headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Content-Length": String(body.byteLength),
    } }));
  } catch { return unavailable(); }
}

// POST {action:"draft"} asks the model for a draft from the recap and keeps it. {action:"save",body} keeps the facilitator's words.
// {action:"clear"} removes the summary.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let body: { action?: unknown; body?: unknown };
  try { body = await limitedJson(request, 16384) as typeof body; } catch { return refuse("invalid_request", 422); }
  const e = { p_engagement: id };
  try {
    if (body?.action === "clear") {
      const r = await fac.client.rpc("workshop_summary_clear", e); if (r.error) throw r.error;
      return r.data.status === "ok" ? answer(r.data) : refuse(String(r.data.status), 404);
    }
    if (body?.action === "save") {
      const text = editedBody(body.body); if (!text) return refuse("invalid_request", 422);
      const r = await fac.client.rpc("workshop_summary_save", { ...e, p: { body: text } }); if (r.error) throw r.error;
      return r.data.status === "ok" ? answer(r.data) : refuse(String(r.data.status), r.data.status === "invalid_request" ? 422 : 404);
    }
    if (body?.action !== "draft") return refuse("invalid_request", 422);
    const state = await fac.client.rpc("workshop_summary_state", e); if (state.error) throw state.error;
    if (state.data.status !== "ok") return refuse(String(state.data.status), 404);
    if (!state.data.ai) return refuse("ai_off");
    const ai = aiClient(); if (!ai) return refuse("ai_unavailable", 503);
    const [recap, show] = await Promise.all([fac.client.rpc("results_recap", e), readShow(fac.client, id)]);
    if (recap.error) throw recap.error;
    if (recap.data?.status !== "ok" || !show) return answer({ status: "denied" }, 403);
    const inputs = summaryInputs(recap.data as Recap, show.context.title);
    if (!inputs.sessions.length) return refuse("nothing");
    const skin = await fac.client.from("engagements").select("skin").eq("id", id).maybeSingle();
    const draft = await draftWorkshopSummary(ai, inputs, undefined, skinOf(skin.data?.skin));
    if (draft.status !== "ok") return refuse(draft.status, draft.status === "empty" ? 409 : 503);
    const saved = await fac.client.rpc("workshop_summary_save", { ...e, p: { body: draft.body, ai: draft.ai } }); if (saved.error) throw saved.error;
    return saved.data.status === "ok" ? answer(saved.data) : refuse(String(saved.data.status));
  } catch (error) {
    console.error("Workshop summary unavailable", { code: (error as { code?: string } | null)?.code });
    return unavailable();
  }
}

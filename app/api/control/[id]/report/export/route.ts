import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { serviceClient } from "@/lib/server/supabase";
import { privateResponse } from "@/lib/auth/response";
import { uuid } from "@/lib/room/identity";
import { readShow } from "@/lib/run-of-show/server";
import { buildReportModel, type ReportModel } from "@/lib/export/report-model";
import { buildDocx } from "@/lib/export/report-docx";
import { buildPdf } from "@/lib/export/report-pdf";

// The Word and PDF export of the report (milestone 7, step 5). Node runtime: docx and react-pdf need it, and the fonts and logo are read from disk
// (next.config.ts traces them into the function).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (data: Record<string, unknown>, status = 200) => privateResponse(NextResponse.json(data, { status }));
// A function that is not in the database yet is "missing" (the page stays quiet). Any other failure is "unavailable", which the page says plainly.
const absent = (e: { code?: string; message?: string }) => e.code === "PGRST202" || e.code === "42883" || /could not find the function/i.test(e.message ?? "");
const fail = (e: { code?: string; message?: string }) => absent(e) ? json({ status: "missing" }, 404) : json({ status: "unavailable", message: "Export isn’t available right now. Try again." }, 503);
const types = { docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", pdf: "application/pdf" } as const;

// GET /api/control/<engagement>/report/export?format=docx|pdf|model&version=signed|draft
//   Lead and co-facilitators only, under their own sign-in (the report's own light status call checks the role again, in the database).
//   version=signed is the newest sign-off, clean, and is refused while nothing is signed. version=draft is the live draft, marked Draft.
//   format=model returns the document model as JSON, for the page's preview. If the report's functions are not in the database yet, this says "missing".
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid(id)) return json({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return json({ status: "denied" }, 401);
  const q = new URL(request.url).searchParams, format = q.get("format") ?? "docx", version = q.get("version") ?? "signed";
  if (!["docx", "pdf", "model"].includes(format) || !["signed", "draft"].includes(version)) return json({ status: "invalid_request", message: "Choose Word or PDF, and the signed off report or the draft." }, 422);
  try {
    const pulse = await fac.client.rpc("report_pulse", { p_engagement: id });
    if (pulse.error) return fail(pulse.error);
    const guard = (pulse.data as { status?: string } | null)?.status;
    if (guard !== "ok") return json({ status: guard === "not_found" ? "missing" : "denied" }, guard === "not_found" ? 404 : 403);

    let sections: unknown, number: number | null = null;
    if (version === "signed") {
      const r = await serviceClient().rpc("report_export_signed", { p_engagement: id });
      if (r.error) return fail(r.error);
      const signed = r.data as { n?: number; sections?: unknown } | null;
      if (!signed?.sections) return json({ status: "not_signed", message: "The report isn't signed off yet. Export the draft, or sign off first." }, 409);
      sections = signed.sections; number = signed.n ?? null;
    } else {
      const r = await fac.client.rpc("report_state", { p_engagement: id });
      const state = r.data as { status?: string; draft?: boolean; sections?: unknown } | null;
      if (r.error) return fail(r.error);
      if (state?.status !== "ok") return json({ status: "denied" }, 403);
      if (!state.draft) return json({ status: "no_draft", message: "There is no draft yet. Draft the report first." }, 409);
      sections = state.sections;
    }

    const show = await readShow(fac.client, id);
    if (!show) return json({ status: "denied" }, 403);
    const dates = await fac.client.from("engagements").select("retreat_start_date,retreat_end_date").eq("id", id).maybeSingle();
    const model: ReportModel = buildReportModel({ church: show.context.church, sections, draft: version === "draft", version: number,
      retreatStart: dates.data?.retreat_start_date ?? null, retreatEnd: dates.data?.retreat_end_date ?? null });
    if (format === "model") return json({ status: "ok", model });

    const body = format === "pdf" ? await buildPdf(model) : await buildDocx(model);
    const name = `${model.fileName}.${format}`;
    const res = privateResponse(new NextResponse(new Uint8Array(body), { status: 200, headers: {
      "Content-Type": types[format as "docx" | "pdf"],
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Content-Length": String(body.byteLength),
    } }));
    return res;
  } catch { return json({ status: "unavailable", message: "The document couldn't be built. The report is safe. Try again." }, 503); }
}

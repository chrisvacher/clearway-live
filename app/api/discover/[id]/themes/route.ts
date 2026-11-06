import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { SLOW_AFTER_MS, themeBody, themeMessage } from "@/lib/discover/themes";
import { kickThemes } from "@/lib/ai/trigger";

export const dynamic = "force-dynamic";
// Drafting runs after the response that starts it and may take a while.
export const maxDuration = 300;
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));
const code = (status: string) => ["ok", "duplicate", "unchanged"].includes(status) ? 200 : status === "denied" ? 403 : status === "not_found" ? 404
  : ["invalid_request"].includes(status) ? 422 : 409;
const reply = (data: { status: string } & Record<string, unknown>) => answer({ ...data, ...(["ok", "duplicate", "unchanged"].includes(data.status) ? {} : { message: themeMessage(data.status) }) }, code(data.status));
// The kit shortens "taking longer than usual"; nothing else reads this.
const slowAfter = () => { const n = Number(process.env.CLEARWAY_AI_THEMES_SLOW_MS); return Number.isFinite(n) && n >= 1000 && n <= 600000 ? n : SLOW_AFTER_MS; };

// The themes for one engagement: facilitators of the engagement only, under their own sign-in. The functions check the role again.
// If the themes functions are not in the database yet, this says "missing" and the Discover page shows what it already had.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid(id)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  try {
    const { data, error } = await fac.client.rpc("discover_themes_state", { p_engagement: id });
    if (error) return answer({ status: "missing" });
    if (data?.status === "ok") kickThemes(id);
    return data?.status === "ok" ? answer({ ...data, slow_after_ms: slowAfter() }) : reply(data);
  } catch { return answer({ status: "unavailable", message: "Themes aren't available right now. Try again." }, 503); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let body: ReturnType<typeof themeBody>;
  try { body = themeBody(await limitedJson(request, 16384)); } catch { body = null; }
  if (!body) return answer({ status: "invalid_request", message: themeMessage("invalid_request") }, 422);
  if ("error" in body) return answer({ status: "invalid_request", message: body.error }, 422);
  const e = { p_engagement: id };
  try {
    const call = async () => {
      switch (body.action) {
        case "draft": return fac.client.rpc("discover_draft_start", { ...e, p_id: body.id });
        case "add": return fac.client.rpc("discover_theme_add", { ...e, p_id: body.id, p_source: body.source, p_label: body.label, p_detail: body.detail, p_sources: body.sources });
        case "rename": return fac.client.rpc("discover_theme_act", { ...e, p_theme: body.theme, p_action: "rename", p: { label: body.label } });
        case "merge": return fac.client.rpc("discover_theme_act", { ...e, p_theme: body.theme, p_action: "merge", p: { into: body.into } });
        default: return fac.client.rpc("discover_theme_act", { ...e, p_theme: body.theme, p_action: body.action, p: null });
      }
    };
    const { data, error } = await call();
    if (error) throw error;
    // Starting a draft runs it after this response.
    if (body.action === "draft" && data.status === "ok") kickThemes(id, true);
    return reply(data);
  } catch { return answer({ status: "unavailable", message: "Themes aren't available right now. Try again." }, 503); }
}

import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { roomMutation } from "@/lib/live/mutation";
import { templateInput, templateMessages, type TemplateAction } from "@/lib/templates/policy";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));
const statusCode = (status: string) => status === "ok" ? 200 : status === "denied" ? 403 : status === "missing" ? 404 : status === "closed" ? 409 : 422;

// The template library (SET-08), read with the facilitator's own session.
export async function GET() {
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const { data, error } = await fac.client.rpc("template_read");
  if (error || !data) return answer({ status: "unavailable" }, 503);
  return answer(data, statusCode(data.status));
}
// Save as template, Start an engagement from a template, Remove template.
export async function POST(request: NextRequest) {
  const config = authConfig();
  if (!config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let body: TemplateAction;
  try { body = templateInput(await limitedJson(request, 16384)); }
  catch (error) { return answer({ status: "invalid_request", message: error instanceof Error && error.message !== "Invalid request" ? error.message : "Check the template details." }, 422); }
  try {
    const write = () => fac.client.rpc("template_write", { p_action: body.action, p_input: body.input });
    // Starting from a template adds sessions to the room, so it carries a room version.
    const { data, error } = body.action === "apply" ? await roomMutation(fac.client, body.input.engagement, write) : await write();
    if (error || !data) throw new Error("save");
    return answer({ ...data, ...(data.status !== "ok" ? { message: templateMessages[data.status] ?? templateMessages.invalid_request } : {}) }, statusCode(data.status));
  } catch { return answer({ status: "unavailable", message: templateMessages.unavailable }, 503); }
}

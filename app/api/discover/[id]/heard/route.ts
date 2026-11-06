import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { SLOW_AFTER_MS, heardBody, heardKeyOf, heardMessage, heardNames, stepFields, type HeardBody, type HeardDraft, type HeardState } from "@/lib/discover/heard";
import { sessionInput } from "@/lib/run-of-show/policy";
import { readShow } from "@/lib/run-of-show/server";
import { roomMutation } from "@/lib/live/mutation";
import { kickHeard } from "@/lib/ai/trigger";
import { aiClient } from "@/lib/ai/client";

export const dynamic = "force-dynamic";
// Drafting runs after the response that starts it and may take a while.
export const maxDuration = 300;
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));
const okay = ["ok", "duplicate", "unchanged"];
const code = (status: string) => okay.includes(status) ? 200 : status === "denied" ? 403 : status === "not_found" || status === "step_missing" ? 404
  : ["invalid_request", "no_step"].includes(status) ? 422 : 409;
const reply = (data: { status: string } & Record<string, unknown>) => answer({ ...data, ...(okay.includes(data.status) ? {} : { message: heardMessage(data.status) }) }, code(data.status));
// The kit shortens "taking longer than usual"; nothing else reads this.
const slowAfter = () => { const n = Number(process.env.CLEARWAY_AI_HEARD_SLOW_MS); return Number.isFinite(n) && n >= 1000 && n <= 600000 ? n : SLOW_AFTER_MS; };

// What We Heard for one engagement: the lead and co-facilitators only, under their own sign-in. The functions check the role again.
// If the functions are not in the database yet, this says "missing" and the Discover page leaves the section out.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid(id)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  try {
    const { data, error } = await fac.client.rpc("discover_heard_state", { p_engagement: id });
    if (error) return answer({ status: "missing" });
    if (data?.status === "ok") kickHeard(id);
    return data?.status === "ok" ? answer({ ...data, slow_after_ms: slowAfter() }) : reply(data);
  } catch { return answer({ status: "unavailable", message: "What We Heard isn't available right now. Try again." }, 503); }
}

type Client = NonNullable<Awaited<ReturnType<typeof getFacilitator>>>["client"];
const editPayload = (b: Extract<HeardBody, { action: "edit" | "apply" }>) => ({ number: b.number, line: b.line, detail: b.detail, ...(b.keep ? { keep: b.keep } : {}) });

// Apply: save the facilitator's edits to the draft, then write the step's headline, number, source and phone depth through the run of show's own
// save (show_write: its role check, its revision check, its refusal when the engagement is closed). Nothing else in the step changes. A step that
// is not live yet reaches the TV and phones only when it goes live as usual; one already live shows the change at once, as any edit to it does.
async function apply(client: Client, engagement: string, body: Extract<HeardBody, { action: "apply" }>) {
  const saved = await client.rpc("discover_heard_edit", { p_engagement: engagement, p_source: body.source, p: editPayload(body) });
  if (saved.error) throw saved.error;
  if (saved.data.status !== "ok") return saved.data as { status: string };
  const read = await client.rpc("discover_heard_state", { p_engagement: engagement });
  if (read.error) throw read.error;
  const source = (read.data as HeardState).sources.find(s => s.key === body.source), draft: HeardDraft | null | undefined = source?.draft;
  if (!source?.step || !draft) return { status: "no_step" };
  const show = await readShow(client, engagement);
  if (!show) return { status: "denied" };
  const session = show.sessions.find(s => s.id === source.step!.id);
  if (!session || heardKeyOf(session.options.source) !== body.source) return { status: "step_missing" };
  let input;
  try { input = sessionInput({ ...session, ...stepFields(draft, session, heardNames[body.source]) }); } catch { return { status: "invalid_request" }; }
  const { data, error } = await roomMutation(client, engagement, () => client.rpc("show_write", { p_engagement: engagement, p_action: "save", p_input: input }));
  if (error) throw error;
  if (data?.status !== "ok") return { status: String(data?.status ?? "unavailable") };
  const marked = await client.rpc("discover_heard_applied", { p_engagement: engagement, p_source: body.source, p_session: session.id });
  if (marked.error) throw marked.error;
  return { status: "ok", step: session.id };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let body: ReturnType<typeof heardBody>;
  try { body = heardBody(await limitedJson(request, 16384)); } catch { body = null; }
  if (!body) return answer({ status: "invalid_request", message: heardMessage("invalid_request") }, 422);
  if ("error" in body) return answer({ status: "invalid_request", message: body.error }, 422);
  // Without a model to ask, a draft would sit pending: say so instead.
  if (body.action === "draft" && !aiClient()) return reply({ status: "ai_unavailable" });
  const e = { p_engagement: id };
  try {
    let data: { status: string } & Record<string, unknown>;
    switch (body.action) {
      case "draft": { const r = await fac.client.rpc("discover_heard_start", { ...e, p_id: body.id }); if (r.error) throw r.error; data = r.data; break; }
      case "edit": { const r = await fac.client.rpc("discover_heard_edit", { ...e, p_source: body.source, p: editPayload(body) }); if (r.error) throw r.error; data = r.data; break; }
      case "discard": { const r = await fac.client.rpc("discover_heard_discard", { ...e, p_source: body.source }); if (r.error) throw r.error; data = r.data; break; }
      default: data = await apply(fac.client, id, body as Extract<HeardBody, { action: "apply" }>);
    }
    // Starting a draft runs it after this response.
    if (body.action === "draft" && data.status === "ok") kickHeard(id, true);
    return reply(data);
  } catch { return answer({ status: "unavailable", message: "What We Heard isn't available right now. Try again." }, 503); }
}

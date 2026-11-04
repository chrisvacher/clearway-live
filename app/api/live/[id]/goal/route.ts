import { NextResponse, type NextRequest } from "next/server";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { participantClient } from "@/lib/room/client";
import { uuid } from "@/lib/room/identity";
import { limitedJson } from "@/lib/server/request";
import { goalBody } from "@/lib/interactions/goals";

export const dynamic = "force-dynamic";
// INT-15 on a phone. GET: the form (the outcome, who can own a goal, the risks, the season ends),
// to this phone only. POST: propose a goal, or change one this person proposed.
function handler(request: NextRequest, id: string) {
  const response = privateResponse(NextResponse.json({ status: "unavailable" }, { status: 503 }));
  const answer = (data: unknown, status = 200) => { const out = privateResponse(NextResponse.json(data, { status })); for (const c of response.cookies.getAll()) out.cookies.set(c); return out; };
  const client = participantClient({ getAll: () => request.cookies.getAll(), setAll: values => { for (const c of values) { request.cookies.set(c.name, c.value); response.cookies.set(c.name, c.value, c.options); } } }, id);
  return { response, answer, client };
}
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!config || !uuid(id)) return privateResponse(NextResponse.json({ status: "invalid_request" }, { status: 400 }));
  const session = request.nextUrl.searchParams.get("session") ?? "";
  if (!uuid(session)) return privateResponse(NextResponse.json({ status: "invalid_request" }, { status: 422 }));
  const { response, answer, client } = handler(request, id);
  try {
    const { data: { session: auth } } = await client.auth.getSession();
    if (!auth) return answer({ status: "denied" }, 403);
    const { data, error } = await client.rpc("goals_form", { p_engagement: id, p_session: session });
    if (error) { console.error("Goal form unavailable", { code: error.code }); return response; }
    return answer(data, data.status === "ok" ? 200 : data.status === "denied" ? 403 : 422);
  } catch { return response; }
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!config || !uuid(id)) return privateResponse(NextResponse.json({ status: "invalid_request" }, { status: 400 }));
  const { response, answer, client } = handler(request, id);
  if (!sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  let body: ReturnType<typeof goalBody>;
  try { body = goalBody(await limitedJson(request, 8192)); } catch { body = null; }
  if (!body) return answer({ status: "invalid_request" }, 422);
  try {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return answer({ status: "denied" }, 403);
    const { data, error } = await client.rpc("goal_propose", { p_engagement: id, p_id: body.id, p_session: body.session, p: { ...body.fields, ...(body.goal ? { goal: body.goal } : {}) } });
    if (error) { console.error("Goal unavailable", { code: error.code }); return response; }
    return answer(data, ["accepted", "duplicate"].includes(data.status) ? 200 : data.status === "denied" ? 403 : data.status === "closed" ? 409 : 422);
  } catch { return response; }
}

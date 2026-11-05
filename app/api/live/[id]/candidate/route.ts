import { NextResponse, type NextRequest } from "next/server";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { participantClient } from "@/lib/room/client";
import { uuid } from "@/lib/room/identity";
import { limitedJson } from "@/lib/server/request";
import { suggestBody } from "@/lib/interactions/candidates";

export const dynamic = "force-dynamic";
// D1-08 Candidate priorities: a phone suggests a rename, a merge or a new candidate. It is stored for
// the facilitator, who accepts it with one tap. Nothing here reaches the TV and no AI is in this path.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  const response = privateResponse(NextResponse.json({ status: "unavailable" }, { status: 503 }));
  const answer = (data: unknown, status = 200) => { const out = privateResponse(NextResponse.json(data, { status })); for (const c of response.cookies.getAll()) out.cookies.set(c); return out; };
  if (!config || !uuid(id)) return answer({ status: "invalid_request" }, 400);
  if (!sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  let body: ReturnType<typeof suggestBody>;
  try { body = suggestBody(await limitedJson(request, 2048)); } catch { body = null; }
  if (!body) return answer({ status: "invalid_request" }, 422);
  try {
    const client = participantClient({ getAll: () => request.cookies.getAll(), setAll: values => { for (const c of values) { request.cookies.set(c.name, c.value); response.cookies.set(c.name, c.value, c.options); } } }, id);
    const { data: { session } } = await client.auth.getSession();
    if (!session) return answer({ status: "denied" }, 403);
    const { data, error } = await client.rpc("candidate_suggest", { p_engagement: id, p_id: body.id, p_session: body.session, p: body.p });
    if (error) { console.error("Candidate suggestion unavailable", { code: error.code }); return response; }
    return answer(data, ["accepted", "duplicate"].includes(data.status) ? 200 : data.status === "denied" ? 403 : data.status === "closed" ? 409 : 422);
  } catch { return response; }
}

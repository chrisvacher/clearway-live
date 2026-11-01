import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { participantClient } from "@/lib/room/client";
import { uuid } from "@/lib/room/identity";

export const dynamic = "force-dynamic";
// A phone's own view: the steps the room has reached and its own answers.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  const response = privateResponse(NextResponse.json({ status: "unavailable" }, { status: 503 }));
  const answer = (data: unknown, status = 200) => { const out = privateResponse(NextResponse.json(data, { status })); for (const c of response.cookies.getAll()) out.cookies.set(c); return out; };
  if (!config || !uuid(id)) return answer({ status: "invalid_request" }, 400);
  try {
    const client = participantClient({ getAll: () => request.cookies.getAll(), setAll: values => { for (const c of values) { request.cookies.set(c.name, c.value); response.cookies.set(c.name, c.value, c.options); } } }, id);
    const { data: { session } } = await client.auth.getSession();
    if (!session) return answer({ status: "denied" }, 403);
    const { data, error } = await client.rpc("phone_room", { p_engagement: id });
    if (error) return response;
    return answer(data, data.status === "ok" ? 200 : 403);
  } catch { return response; }
}

import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { participantClient } from "@/lib/room/client";
import { uuid } from "@/lib/room/identity";

export const dynamic = "force-dynamic";
// D2-04 on a phone. GET: the item on show with the room's sentences behind each line, and the settled items, to this phone only.
// The TV never gets them. The answer itself (Yes, that's us, It needs a change, What's missing?) goes through the room's answer route.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!config || !uuid(id)) return privateResponse(NextResponse.json({ status: "invalid_request" }, { status: 400 }));
  const session = request.nextUrl.searchParams.get("session") ?? "";
  if (!uuid(session)) return privateResponse(NextResponse.json({ status: "invalid_request" }, { status: 422 }));
  const response = privateResponse(NextResponse.json({ status: "unavailable" }, { status: 503 }));
  const answer = (data: unknown, status = 200) => { const out = privateResponse(NextResponse.json(data, { status })); for (const c of response.cookies.getAll()) out.cookies.set(c); return out; };
  const client = participantClient({ getAll: () => request.cookies.getAll(), setAll: values => { for (const c of values) { request.cookies.set(c.name, c.value); response.cookies.set(c.name, c.value, c.options); } } }, id);
  try {
    const { data: { session: auth } } = await client.auth.getSession();
    if (!auth) return answer({ status: "denied" }, 403);
    const { data, error } = await client.rpc("read_back_phone", { p_engagement: id, p_session: session });
    if (error) { console.error("Read-back phone unavailable", { code: error.code }); return response; }
    return answer(data, data.status === "ok" ? 200 : data.status === "denied" ? 403 : 404);
  } catch { return response; }
}

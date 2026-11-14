import { NextResponse, type NextRequest } from "next/server";
import { authConfig, sameAddress } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { getFacilitator } from "@/lib/server/facilitator";
import { uuid } from "@/lib/room/identity";
import { tvClient } from "@/lib/tv/client";
import { roomMutation } from "@/lib/live/mutation";

export const dynamic = "force-dynamic";
// Any paired TV or facilitator asks the database to end an expired burst. The
// database decides from its own clock, so an early or repeated tick does nothing.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  const response = privateResponse(NextResponse.json({ status: "unavailable" }, { status: 503 }));
  const answer = (data: unknown, status = 200) => { const out = privateResponse(NextResponse.json(data, { status })); for (const c of response.cookies.getAll()) out.cookies.set(c); return out; };
  if (!uuid(id) || !config || !sameAddress(request)) return answer({ status: "denied" }, 403);
  const surface = request.nextUrl.searchParams.get("surface");
  try {
    const client = surface === "tv"
      ? tvClient({ getAll: () => request.cookies.getAll(), setAll: values => { for (const c of values) { request.cookies.set(c.name, c.value); response.cookies.set(c.name, c.value, c.options); } } })
      : surface === "control" ? (await getFacilitator())?.client : null;
    if (!client) return answer({ status: "denied" }, 403);
    const { data, error } = await roomMutation(client, id, () => client.rpc("live_tick", { p_engagement: id }));
    if (error) return response;
    return answer(data, data.status === "denied" ? 403 : 200);
  } catch { return response; }
}

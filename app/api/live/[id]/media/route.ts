import { NextResponse, type NextRequest } from "next/server";
import { sameAddress } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { roomMutation } from "@/lib/live/mutation";
import { uuid } from "@/lib/room/identity";
import { limitedJson } from "@/lib/server/request";
import { tvClient } from "@/lib/tv/client";

export const dynamic = "force-dynamic";
// The TV reports playback events. The database checks the pairing, current playback timestamp and clock.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const response = new NextResponse(null);
  const answer = (data: unknown, status = 200) => {
    const out = privateResponse(NextResponse.json(data, { status }));
    for (const cookie of response.cookies.getAll()) out.cookies.set(cookie);
    return out;
  };
  if (!uuid(id) || !sameAddress(request)) return answer({ status: "denied" }, 403);
  try {
    const body = await limitedJson(request, 2048);
    const { session, at, duration, soundBlocked } = body;
    if (!uuid(session) || typeof at !== "string" || at.length > 40 || !Number.isFinite(Date.parse(at))
      || duration !== undefined && (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0 || duration > 86400)
      || soundBlocked !== undefined && typeof soundBlocked !== "boolean") return answer({ status: "invalid_request" }, 422);
    const client = tvClient({ getAll: () => request.cookies.getAll(), setAll: values => {
      for (const c of values) { request.cookies.set(c.name, c.value); response.cookies.set(c.name, c.value, c.options); }
    } });
    const { data, error } = await roomMutation(client, id, () => client.rpc("video_tick", {
      p_engagement: id, p_session: session, p_at: at, p_duration: duration ?? null, p_sound_blocked: soundBlocked ?? null,
    }));
    if (error) throw error;
    return answer(data, data.status === "denied" ? 403 : 200);
  } catch { return answer({ status: "unavailable" }, 503); }
}

import { NextResponse, type NextRequest } from "next/server";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { uuid } from "@/lib/room/policy";
import { getFacilitator } from "@/lib/server/facilitator";
import { limitedJson } from "@/lib/server/request";
import { serviceClient } from "@/lib/server/supabase";

const answer = (data: Record<string, unknown>, status = 200) => privateResponse(NextResponse.json(data, { status }));

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const config = authConfig();
  if (!config || !sameOrigin(request, config.origin)) return answer({ ok: false }, 403);
  const facilitator = await getFacilitator();
  if (!facilitator) return answer({ ok: false }, 401);
  const { id } = await params;
  if (!uuid(id)) return answer({ ok: false }, 400);

  const body = await limitedJson(request, 131072).catch(() => null);
  if (!body || !Array.isArray(body.attendees) || !body.attendees.length || body.attendees.length > 500) return answer({ ok: false }, 400);
  const { client } = facilitator;
  const { data: event } = await client.from("engagements").select("id").eq("id", id).eq("deleted", false).maybeSingle();
  if (!event) return answer({ ok: false }, 404);

  if (body.action === "restore") {
    const valid = body.attendees.every(entry => entry && typeof entry === "object" && uuid(entry.id)
      && typeof entry.updated_at === "string" && Number.isFinite(Date.parse(entry.updated_at)));
    if (!valid) return answer({ ok: false }, 400);
  } else if (!body.attendees.every(uuid)) return answer({ ok: false }, 400);

  let result;
  if (body.action === "merge" && uuid(body.keep)) {
    result = await client.rpc("attendee_merge", { p_engagement: id, p_keep: body.keep, p_merge: body.attendees });
  } else if (body.action === "remove" || body.action === "restore" || body.action === "role") {
    if (body.action === "role" && body.role !== "participant" && body.role !== "scribe") return answer({ ok: false }, 400);
    result = await client.rpc("attendee_roster_change", {
      p_engagement: id, p_action: body.action,
      p_people: body.action === "restore" ? body.attendees : body.attendees.map(id => ({ id })),
      p_role: body.action === "role" ? body.role : null,
    });
  } else return answer({ ok: false }, 400);

  if (result.error?.code === "PGRST202") return answer({ ok: false, message: "This action isn’t available yet." }, 503);
  if (result.error?.code === "42501") return answer({ ok: false }, 403);
  if (result.error || result.data?.status !== "ok") {
    return answer({
      ok: false,
      message: result.data?.status === "busy" ? "The room is updating these people. Try again." : body.action === "merge" ? "Choose entries with the same name, no email and the Participant role."
        : body.action === "restore" ? "The roster has changed. Add the person again if needed."
        : "The roster has changed. Review the selection and try again.",
    }, 409);
  }
  try {
    const notice = await serviceClient().rpc("tv_presence_sync", { p_engagement: id });
    if (notice.error) console.error("TV roster notification unavailable", { code: notice.error.code });
  } catch { console.error("TV roster notification unavailable"); }
  return answer({ ok: true, removed: result.data.removed });
}

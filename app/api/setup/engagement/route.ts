import { NextResponse, type NextRequest } from "next/server";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { getFacilitator } from "@/lib/server/facilitator";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { stagesFor } from "@/lib/setup/stage";
import { duplicateEvent } from "@/lib/run-of-show/duplicate-server";

export const maxDuration = 300;

const answer = (body: { ok: boolean; message?: string; status?: string; id?: string }, status = 200) =>
  privateResponse(NextResponse.json(body, { status }));

export async function POST(request: NextRequest) {
  const config = authConfig();
  if (!config || !sameOrigin(request, config.origin)) return answer({ ok: false }, 403);
  const facilitator = await getFacilitator();
  if (!facilitator) return answer({ ok: false }, 401);
  const { client } = facilitator;

  try {
    const { action, id, name, status } = await limitedJson(request, 4096);
    if (action === "link_name") {
      if (typeof name !== "string" || name.length > 24 || (id != null && !uuid(id))) return answer({ ok: false, status: "invalid_name" }, 400);
      const { data, error } = await client.rpc("engagement_link_name_status", { p_name: name, p_engagement: id ?? null });
      if (error) return answer({ ok: false, status: "unavailable" }, 503);
      return data === "denied" ? answer({ ok: false, status: data }, 403) : answer({ ok: true, status: data });
    }
    if (!uuid(id)) return answer({ ok: false }, 400);

    if (action === "stage") {
      const { data: engagement } = await client.from("engagements").select("type").eq("id", id).eq("deleted", false).maybeSingle();
      if (!engagement) return answer({ ok: false, message: "This engagement isn't available." }, 404);
      if (engagement.type === "team_workshop" || !stagesFor(engagement.type).some(choice => choice.status === status)) return answer({ ok: false, message: "Choose a stage for this engagement." }, 400);
      const { data, error } = await client.from("engagements").update({ status }).eq("id", id).eq("deleted", false).select("id").maybeSingle();
      return error || !data ? answer({ ok: false, message: "We couldn't change the stage." }, 400) : answer({ ok: true });
    }

    if (action === "duplicate") {
      const copy = await duplicateEvent(client, id);
      if (copy.status === "ok") return answer({ ok: true, id: copy.id });
      if (copy.status === "denied") return answer({ ok: false, message: "You don't have access to do that for this engagement." }, 403);
      return answer({ ok: false, message: "We couldn't duplicate this event. Please try again." }, 409);
    }
    const rpc = action === "archive" ? "engagement_hide_from_list" : action === "restore" ? "engagement_restore" : null;
    if (!rpc) return answer({ ok: false }, 400);
    const { data, error } = await client.rpc(rpc, { p_engagement: id });
    if (error || !data) return answer({ ok: false, message: "We couldn't finish that. Please try again." }, 503);
    if (data.status === "denied") return answer({ ok: false, message: "You don't have access to do that for this engagement." }, 403);
    if (data.status !== "ok") return answer({ ok: false, message: "This engagement isn't available." }, 404);
    return answer({ ok: true, id: data.id });
  } catch {
    return answer({ ok: false, message: "We couldn't finish that. Please try again." }, 400);
  }
}

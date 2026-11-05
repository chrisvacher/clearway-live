import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { roomMutation } from "@/lib/live/mutation";
import { serviceClient } from "@/lib/server/supabase";
import { rehearsalBody } from "@/lib/run-of-show/self-paced";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));

// Facilitator-only: start or end a rehearsal, or Clear test answers. One press each,
// decided under the room lock and logged; clearing is refused while a session is live.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let press: ReturnType<typeof rehearsalBody>;
  try { press = rehearsalBody(await limitedJson(request)); } catch { press = null; }
  if (!press) return answer({ status: "invalid_request" }, 422);
  const { id: pressId, action } = press;
  try {
    // Clear test answers also puts away the scribe cards and files a rehearsal made. The bytes of the test files go
    // through Storage afterwards, as the practice reset does; their paths are read first, while the rows still stand.
    const paths = action === "clear" ? await fac.client.rpc("rehearsal_scribe_paths", { p_engagement: id }).then(r => Array.isArray(r.data) ? (r.data as unknown[]).filter((p): p is string => typeof p === "string") : [], () => [] as string[]) : [];
    const { data, error } = await roomMutation(fac.client, id, () => fac.client.rpc("rehearsal_control", { p_engagement: id, p_id: pressId, p_action: action }));
    if (error) throw error;
    const status = data.status as string;
    if (action === "clear" && status === "ok" && paths.length) {
      const gone = await serviceClient().storage.from("scribe").remove(paths).catch(() => ({ error: true }));
      if (gone.error) console.error("Rehearsal scribe files could not be removed from Storage");
    }
    return answer(data, ["ok", "duplicate", "unchanged"].includes(status) ? 200 : status === "denied" ? 403 : status === "invalid_request" ? 422 : 409);
  } catch (error) {
    console.error("Rehearsal control unavailable", { code: typeof error === "object" && error && "code" in error ? error.code : "request_failed" });
    return answer({ status: "unavailable" }, 503);
  }
}

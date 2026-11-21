import { NextResponse, type NextRequest } from "next/server";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { getFacilitator } from "@/lib/server/facilitator";
import { limitedJson } from "@/lib/server/request";
import { duplicateShow } from "@/lib/run-of-show/duplicate-server";
import { uuid } from "@/lib/room/identity";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));
const messages: Record<string, string> = {
  live: "Duplicate after the workshop ends, or into another engagement.",
  has_answers: "Keep the target’s steps because they already have answers. Choose Add after them.",
  conflict: "The run of show changed while copying. Try again.",
  unavailable_target: "Choose another engagement.",
  empty: "This run of show has no steps to copy.",
  media_unavailable: "Couldn’t copy the media. Try again, or uncheck Images and videos.",
};
export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("source"), fac = await getFacilitator();
  if (!uuid(source) || !fac) return answer({ status: "denied" }, 403);
  const { data, error } = await fac.client.rpc("duplicate_show_options", { p_source: source });
  if (error) return answer({ status: "unavailable" }, 503);
  return answer(data, data.status === "ok" ? 200 : 403);
}
export async function POST(request: NextRequest) {
  const config = authConfig(), fac = await getFacilitator();
  if (!config || !sameOrigin(request, config.origin) || !fac) return answer({ status: "denied" }, 403);
  try {
    const { source, target, replace, media, times, visibility } = await limitedJson(request, 8192);
    if (!uuid(source) || !uuid(target) || typeof replace !== "boolean" || typeof media !== "boolean"
      || typeof times !== "boolean" || typeof visibility !== "boolean") return answer({ status: "invalid_request" }, 422);
    const result = await duplicateShow(fac.client, source, target, { replace, media, times, visibility });
    if (result.status === "ok") return answer(result);
    return answer({ ...result, message: messages[result.status] ?? "Couldn’t duplicate the run of show. Try again." }, result.status === "denied" ? 403 : 409);
  } catch { return answer({ status: "unavailable", message: "Couldn’t duplicate the run of show. Try again." }, 503); }
}

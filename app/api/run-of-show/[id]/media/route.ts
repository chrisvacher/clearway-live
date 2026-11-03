import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { mediaInput } from "@/lib/interactions/media";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));

// The image for an image or document page. The facilitator's browser fits it to the
// TV first; the database checks the facilitator, the session and the bytes again.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let input: ReturnType<typeof mediaInput>;
  try { input = mediaInput(await limitedJson(request, 5_800_000)); } catch { input = null; }
  if (!input) return answer({ status: "invalid_request", message: "Choose a PNG, JPEG or WebP image under 4 MB." }, 422);
  try {
    const { data, error } = await fac.client.rpc("media_write", { p_engagement: id, p_session: input.session, p_mime: input.mime, p_width: input.width, p_height: input.height, p_data: input.data });
    if (error) throw error;
    return answer(data, data.status === "ok" ? 200 : data.status === "denied" ? 403 : data.status === "missing" ? 404 : 422);
  } catch { return answer({ status: "unavailable" }, 503); }
}

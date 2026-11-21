import { NextResponse, type NextRequest } from "next/server";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { getFacilitator } from "@/lib/server/facilitator";
import { limitedJson } from "@/lib/server/request";
import { serviceClient } from "@/lib/server/supabase";
import { uuid } from "@/lib/room/identity";
import { resumableVideoEndpoint, videoBucket, videoUploadRequest } from "@/lib/video/files";

export const dynamic = "force-dynamic";
const answer = (value: unknown, status = 200) => privateResponse(NextResponse.json(value, { status }));
export async function GET(request: NextRequest) {
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const engagement = request.nextUrl.searchParams.get("engagement");
  if (!uuid(engagement)) return answer({ status: "invalid_request" }, 422);
  const { data, error } = await fac.client.rpc("video_list", { p_engagement: engagement });
  if (error) return answer({ status: "unavailable" }, 503);
  return answer(data, data.status === "ok" ? 200 : 403);
}
export async function POST(request: NextRequest) {
  const config = authConfig(); if (!config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  try {
    const input = videoUploadRequest(await limitedJson(request, 8192));
    if (!input) return answer({ status: "invalid_request", message: "Choose an MP4 or MOV video up to 500 MB." }, 422);
    const common = { p_engagement: input.engagement, p_id: input.id };
    if (input.action === "finish") {
      const result = await fac.client.rpc("video_finish", { ...common, p_width: input.width, p_height: input.height, p_duration: input.duration });
      if (result.error) throw result.error;
      return answer(result.data, result.data.status === "ok" ? 200 : result.data.status === "denied" ? 403 : 422);
    }
    const result = await fac.client.rpc("video_begin", { ...common, p_name: input.name, p_mime: input.mime, p_bytes: input.bytes });
    if (result.error) throw result.error;
    const { status, path, uploaded } = result.data;
    if (status !== "ok") return answer({ status }, status === "denied" ? 403 : 422);
    if (uploaded) return answer({ status: "ok", uploaded });
    const { data, error } = await serviceClient().storage.from(videoBucket).createSignedUploadUrl(path);
    if (error || !data) throw error;
    return answer({ status: "ok", uploaded: false, upload: { url: data.signedUrl, token: data.token, path, key: config.key, resumable: resumableVideoEndpoint(config.url) } });
  } catch { return answer({ status: "unavailable", message: "Couldn’t prepare this video. Try again." }, 503); }
}

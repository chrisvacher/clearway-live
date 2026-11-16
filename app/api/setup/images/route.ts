import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { serviceClient } from "@/lib/server/supabase";
import { uuid } from "@/lib/room/policy";
import { imageBucket } from "@/lib/images/shared";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const answer = (data: Record<string, unknown>, status = 200) => privateResponse(NextResponse.json(data, { status }));
const words: Record<string, string> = {
  denied: "You can’t add images to this engagement.", closed: "This engagement has closed.", invalid_type: "Use a PNG, JPG or WebP image.",
  too_large: "Use an image of 20 MB or smaller.", full: "This engagement has 500 images, the most it can hold.", not_uploaded: "That image didn’t finish uploading. Please try again.",
};
// The engagement's images for the run of show.
export async function GET(request: NextRequest) {
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const engagement = request.nextUrl.searchParams.get("engagement");
  if (!uuid(engagement)) return answer({ status: "invalid_request" }, 400);
  const { data, error } = await fac.client.rpc("image_list", { p_engagement: engagement });
  if (error) return answer({ status: "unavailable" }, 503);
  return answer(data, data.status === "ok" ? 200 : 403);
}
// begin: record the image and hand back a signed address the browser puts the bytes at.
// finish: the database checks the object landed and records the shape the browser measured.
export async function POST(request: NextRequest) {
  const config = authConfig(); if (!config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return answer({ status: "invalid_request" }, 400); }
  if (!uuid(body.engagement) || !uuid(body.id)) return answer({ status: "invalid_request" }, 400);
  try {
    if (body.action === "begin") {
      const { data, error } = await fac.client.rpc("image_begin", { p_engagement: body.engagement, p_id: body.id, p_name: String(body.name ?? "").slice(0, 200), p_mime: String(body.mime ?? ""), p_bytes: Number(body.bytes) });
      if (error) throw error;
      if (data.status !== "ok") return answer({ status: data.status, message: words[data.status] ?? "We couldn’t add that image." }, data.status === "denied" ? 403 : 400);
      if (data.uploaded) return answer({ status: "ok", uploaded: true });
      const signed = await serviceClient().storage.from(imageBucket).createSignedUploadUrl(data.path, { upsert: true });
      if (signed.error || !signed.data) return answer({ status: "unavailable", message: "Image upload isn’t available right now." }, 503);
      return answer({ status: "ok", uploaded: false, upload: { url: signed.data.signedUrl, key: config.key } });
    }
    if (body.action === "finish") {
      const { data, error } = await fac.client.rpc("image_finish", { p_engagement: body.engagement, p_id: body.id, p_width: Math.round(Number(body.width)), p_height: Math.round(Number(body.height)) });
      if (error) throw error;
      return answer(data.status === "ok" ? data : { status: data.status, message: words[data.status] ?? "We couldn’t add that image." }, data.status === "ok" ? 200 : 400);
    }
    return answer({ status: "invalid_request" }, 400);
  } catch { return answer({ status: "unavailable", message: "We couldn’t add that image. Please try again." }, 503); }
}

import { NextResponse, type NextRequest } from "next/server";
import { facilitatorClient } from "@/lib/auth/client";
import { privateResponse } from "@/lib/auth/response";
import { uuid } from "@/lib/room/identity";
import { serviceClient } from "@/lib/server/supabase";
import { tvClient } from "@/lib/tv/client";
import { videoBucket } from "@/lib/video/files";

export const dynamic = "force-dynamic";
const lifetime = 8 * 60 * 60;
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; video: string }> }) {
  const { id, video } = await params;
  const surface = request.nextUrl.searchParams.get("surface");
  const failure = (status: number) => privateResponse(new NextResponse(null, { status }));
  if (!uuid(id) || !uuid(video) || (surface !== "tv" && surface !== "control")) return failure(404);
  const response = new NextResponse(null);
  const jar = { getAll: () => request.cookies.getAll(), setAll: (values: { name: string; value: string; options: Parameters<typeof response.cookies.set>[2] }[]) => {
    for (const { name, value, options } of values) { request.cookies.set(name, value); response.cookies.set(name, value, options); }
  } };
  try {
    const client = surface === "tv" ? tvClient(jar) : facilitatorClient(jar);
    if (!client) return failure(403);
    const { data: { session } } = await client.auth.getSession();
    if (!session) return failure(403);
    const { data, error } = await client.rpc("video_read", { p_engagement: id, p_video: video });
    if (error) throw error;
    if (data.status !== "ok") return failure(data.status === "denied" ? 403 : 404);
    const signed = await serviceClient().storage.from(videoBucket).createSignedUrl(data.path, lifetime);
    if (signed.error || !signed.data) return failure(503);
    const out = NextResponse.redirect(signed.data.signedUrl, 302);
    out.headers.set("Cache-Control", "private, max-age=14400");
    out.headers.set("X-Content-Type-Options", "nosniff");
    for (const cookie of response.cookies.getAll()) out.cookies.set(cookie);
    return out;
  } catch { return failure(503); }
}

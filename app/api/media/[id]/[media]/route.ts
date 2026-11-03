import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/lib/auth/policy";
import { facilitatorClient } from "@/lib/auth/client";
import { privateResponse } from "@/lib/auth/response";
import { participantClient } from "@/lib/room/client";
import { uuid } from "@/lib/room/identity";
import { tvClient } from "@/lib/tv/client";

export const dynamic = "force-dynamic";

// A content screen's image, for the TV, a phone or the control surface. Each reads it
// with its own native session; the database decides whether that room member may.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; media: string }> }) {
  const { id, media } = await params, config = authConfig();
  const surface = request.nextUrl.searchParams.get("surface") || "phone";
  const fail = (status: number) => privateResponse(new NextResponse(null, { status }));
  if (!config || !uuid(id) || !uuid(media) || !["phone", "tv", "control"].includes(surface)) return fail(404);
  const response = new NextResponse(null);
  const jar = { getAll: () => request.cookies.getAll(), setAll: (values: { name: string; value: string; options: Parameters<typeof response.cookies.set>[2] }[]) => {
    for (const { name, value, options } of values) { request.cookies.set(name, value); response.cookies.set(name, value, options); }
  } };
  const client = surface === "control" ? facilitatorClient(jar) : surface === "tv" ? tvClient(jar) : participantClient(jar, id);
  if (!client) return fail(403);
  try {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return fail(403);
    const { data, error } = await client.rpc("media_read", { p_engagement: id, p_media: media });
    if (error) throw error;
    if (data?.status !== "ok") return fail(data?.status === "denied" ? 403 : 404);
    const out = new NextResponse(Buffer.from(data.data, "base64"), { headers: {
      "Content-Type": data.mime, "Cache-Control": "private, max-age=86400, immutable", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" } });
    for (const cookie of response.cookies.getAll()) out.cookies.set(cookie);
    return out;
  } catch { return fail(503); }
}

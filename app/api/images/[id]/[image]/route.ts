import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/lib/auth/policy";
import { facilitatorClient } from "@/lib/auth/client";
import { privateResponse } from "@/lib/auth/response";
import { participantClient } from "@/lib/room/client";
import { uuid } from "@/lib/room/identity";
import { tvClient } from "@/lib/tv/client";
import { serviceClient } from "@/lib/server/supabase";
import { imageBucket } from "@/lib/images/shared";

export const dynamic = "force-dynamic";
const signedSeconds = 60 * 60;

// An engagement image for the TV or the control surface. Each reads with its own session and the database decides whether
// that reader may; the image itself then comes from a short-lived signed address in the private bucket. Phones draw slide
// images only in the TV view on phones (a mirror of the TV), which asks as surface=phone; a phone's own screens never ask.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; image: string }> }) {
  const { id, image } = await params, config = authConfig();
  const surface = request.nextUrl.searchParams.get("surface") || "phone";
  const fail = (status: number) => privateResponse(new NextResponse(null, { status }));
  if (!config || !uuid(id) || !uuid(image) || !["phone", "tv", "control"].includes(surface)) return fail(404);
  const response = new NextResponse(null);
  const jar = { getAll: () => request.cookies.getAll(), setAll: (values: { name: string; value: string; options: Parameters<typeof response.cookies.set>[2] }[]) => {
    for (const { name, value, options } of values) { request.cookies.set(name, value); response.cookies.set(name, value, options); }
  } };
  const client = surface === "control" ? facilitatorClient(jar) : surface === "tv" ? tvClient(jar) : participantClient(jar, id);
  if (!client) return fail(403);
  try {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return fail(403);
    const { data, error } = await client.rpc("image_read", { p_engagement: id, p_image: image });
    if (error) throw error;
    if (data?.status !== "ok") return fail(data?.status === "denied" ? 403 : 404);
    return await signed(data.path, response);
  } catch { return fail(503); }
}

async function signed(path: string, response: NextResponse) {
  const made = await serviceClient().storage.from(imageBucket).createSignedUrl(path, signedSeconds);
  if (made.error || !made.data) return privateResponse(new NextResponse(null, { status: 503 }));
  const out = NextResponse.redirect(made.data.signedUrl, 302);
  // The browser keeps the redirect for half the signed address's life, so a TV preloading an image and then showing it asks once.
  out.headers.set("Cache-Control", `private, max-age=${signedSeconds / 2}`);
  out.headers.set("X-Content-Type-Options", "nosniff");
  for (const cookie of response.cookies.getAll()) out.cookies.set(cookie);
  return out;
}

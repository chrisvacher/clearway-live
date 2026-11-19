import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/lib/auth/policy";
import { facilitatorClient } from "@/lib/auth/client";
import { privateResponse } from "@/lib/auth/response";
import { sessionId } from "@/lib/room/policy";
import { serviceClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

// An event's admin link (November 19). The code names the event's link guest; the server makes that guest's Auth session
// (no email is sent), binds it to the code, and opens the event's Live room. A browser already signed in as a Clearway person
// keeps its own sign-in. A replaced or unknown code says so, and signs nobody in.
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params, config = authConfig();
  const go = (path: string, response?: NextResponse) => {
    const out = NextResponse.redirect(new URL(path, config?.origin ?? request.nextUrl.origin), 303);
    for (const cookie of response?.cookies.getAll() ?? []) out.cookies.set(cookie);
    out.headers.set("Referrer-Policy", "no-referrer");
    return privateResponse(out);
  };
  if (!config || !/^[a-z2-9]{12}$/i.test(code)) return go("/a/ended?reason=missing");
  const open = async (action: string, p: Record<string, unknown>) => {
    const { data, error } = await serviceClient().rpc("event_link_open", { p_action: action, p });
    if (error) throw error;
    return data as { status: string; email?: string; engagement?: string };
  };
  try {
    const prepared = await open("prepare", { code });
    if (prepared.status !== "ok" || !prepared.email || !prepared.engagement) return go(`/a/ended?reason=${prepared.status === "replaced" ? "replaced" : "missing"}`);
    const response = new NextResponse(null);
    const jar = { getAll: () => request.cookies.getAll(), setAll: (values: { name: string; value: string; options: Parameters<typeof response.cookies.set>[2] }[]) => {
      for (const { name, value, options } of values) { request.cookies.set(name, value); response.cookies.set(name, value, options); }
    } };
    const client = facilitatorClient(jar);
    if (!client) return go("/a/ended?reason=unavailable");
    // A Clearway person who opens the link keeps their own sign-in.
    const { data: { user } } = await client.auth.getUser();
    if (user && user.email && !user.email.toLowerCase().endsWith("@link.clearway.invalid")) {
      const { data: mine } = await client.from("clearway_users").select("kind").eq("auth_user_id", user.id).eq("deleted", false).maybeSingle();
      if (mine?.kind === "person") return go(`/control/${prepared.engagement}`, response);
    }
    const { data: generated, error } = await serviceClient().auth.admin.generateLink({ type: "magiclink", email: prepared.email });
    if (error || !generated.properties?.hashed_token) throw new Error("link unavailable");
    const type = generated.properties.verification_type; if (type !== "magiclink" && type !== "signup") throw new Error("link unavailable");
    // No email is sent. The token is exchanged here, on the server, for this browser's own session.
    const { data: verified, error: failed } = await client.auth.verifyOtp({ token_hash: generated.properties.hashed_token, type });
    if (failed || !verified.session || !verified.user) throw new Error("link unavailable");
    const native = sessionId(verified.session.access_token); if (!native) throw new Error("link unavailable");
    const bound = await open("bind", { code, user: verified.user.id, session: native });
    if (bound.status !== "ok") { await client.auth.signOut({ scope: "local" }); return go("/a/ended?reason=missing", response); }
    return go(`/control/${prepared.engagement}`, response);
  } catch {
    return go("/a/ended?reason=unavailable");
  }
}

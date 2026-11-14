import { NextResponse, type NextRequest } from "next/server";
import { facilitatorClient, type CookieJar } from "@/lib/auth/client";
import { privateResponse } from "@/lib/auth/response";
import { hasRoomCookie, participantClient } from "@/lib/room/client";
import { addressDecision, resolveRoom } from "@/lib/room/address";
import { tvClient } from "@/lib/tv/client";
import { uuid } from "@/lib/room/identity";

// Which session each path refreshes: the room's phone session, the TV's, or the facilitator's. Anything else only gets
// the address check below.
const under = (path: string, base: string) => path === base || path.startsWith(base + "/");
const facilitatorPaths = ["/api/tv/control", "/api/control", "/remote", "/setup", "/control", "/api/facilitator", "/api/run-of-show"];
const refreshKind = (path: string) => path === "/room" || path.startsWith("/room/") ? "room" : path === "/tv" ? "tv" : path === "/sign-in" || facilitatorPaths.some(base => under(path, base)) ? "facilitator" : null;

export async function middleware(request: NextRequest) {
  // The address decides where a request belongs, before any page is drawn or cookie is set.
  const { pathname, search } = request.nextUrl;
  const decision = await addressDecision({ method: request.method, host: request.headers.get("host"), pathname, search, cookies: request.cookies, resolve: rule => resolveRoom(rule) });
  // The Location header is written as is. NextResponse.redirect would rewrite 127.0.0.1 to localhost, and the local kits tell the two addresses apart by those.
  if (decision.action === "redirect") return privateResponse(new NextResponse(null, { status: 307, headers: { Location: decision.location } }));
  if (decision.action === "refuse") return privateResponse(new NextResponse("Request not accepted.", { status: 403 }));
  const kind = refreshKind(pathname);
  if (!kind) return NextResponse.next();
  let response = NextResponse.next({ request });
  const jar:CookieJar = {
    getAll: () => request.cookies.getAll(),
    setAll: values => {
      for (const { name, value } of values) request.cookies.set(name, value);
      response = NextResponse.next({ request });
      for (const { name, value, options } of values) response.cookies.set(name, value, options);
    },
  };
  // Confirmation links remain inert on GET, including when a room cookie exists.
  const room=pathname.match(/^\/room\/([^/]+)$/)?.[1];
  const client=kind==="room"
    ?(room&&uuid(room)&&hasRoomCookie(jar,room)?participantClient(jar,room):null)
    :kind==="tv"?tvClient(jar):facilitatorClient(jar);
  if (client) await client.auth.getUser();
  // Refresh only. Page and data guards independently authorize every request.
  return privateResponse(response);
}

// The address check covers every facilitator path (so Novetera's address can send them to Clearway's), every place a
// room code, link name or room link can appear, and the paths that refresh a session.
export const config = { runtime: "nodejs", matcher: ["/tv", "/api/tv/control/:path*", "/api/control/:path*", "/remote/:path*", "/sign-in", "/setup/:path*", "/control/:path*", "/api/facilitator/:path*", "/api/run-of-show/:path*", "/room/:path*",
  "/auth/:path*", "/api/setup/:path*", "/api/templates", "/api/operations/:path*", "/api/discover/:path*", "/api/overnight/:path*", "/api/scribe/:path*",
  "/r/:code", "/join", "/practice", "/:code([A-Za-z0-9%\\-]+)"] };

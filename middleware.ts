import { NextResponse, type NextRequest } from "next/server";
import { facilitatorClient, type CookieJar } from "@/lib/auth/client";
import { privateResponse } from "@/lib/auth/response";
import { hasRoomCookie, participantClient } from "@/lib/room/client";
import { uuid } from "@/lib/room/identity";

export async function middleware(request: NextRequest) {
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
  const room=request.nextUrl.pathname.match(/^\/room\/([^/]+)$/)?.[1];
  const roomPage=request.nextUrl.pathname.startsWith("/room");
  const client=roomPage
    ?(room&&uuid(room)&&hasRoomCookie(jar,room)?participantClient(jar,room):null)
    :facilitatorClient(jar);
  if (client) await client.auth.getUser();
  // Refresh only. Page and data guards independently authorize every request.
  return privateResponse(response);
}

export const config = { runtime: "nodejs", matcher: ["/sign-in", "/setup/:path*", "/control/:path*", "/api/facilitator/:path*", "/room/:path*"] };

import { NextResponse, type NextRequest } from "next/server";
import { facilitatorClient } from "@/lib/auth/client";
import { privateResponse } from "@/lib/auth/response";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const client = facilitatorClient({
    getAll: () => request.cookies.getAll(),
    setAll: values => {
      for (const { name, value } of values) request.cookies.set(name, value);
      response = NextResponse.next({ request });
      for (const { name, value, options } of values) response.cookies.set(name, value, options);
    },
  });
  if (client) await client.auth.getUser();
  // Refresh only. Page and data guards independently authorize every request.
  return privateResponse(response);
}

export const config = { runtime: "nodejs", matcher: ["/sign-in", "/setup/:path*", "/control/:path*", "/api/facilitator/:path*"] };

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authResponse, clearFacilitatorCookies, privateResponse } from "@/lib/auth/response";
import { sameOrigin } from "@/lib/auth/policy";

export async function POST(request: NextRequest) {
  const { config, client, response } = authResponse(request);
  if (!config || !client) return response;
  if (!sameOrigin(request, config.origin)) return privateResponse(new NextResponse("Request not accepted.", { status: 403 }));
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) return privateResponse(new NextResponse("Sign-out could not finish. Please try again.", { status: 503 }));
  clearFacilitatorCookies(request, response);
  response.headers.set("Location", new URL("/sign-in", config.origin).toString());
  return response;
}

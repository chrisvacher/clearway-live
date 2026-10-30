import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authResponse, privateResponse } from "@/lib/auth/response";
import { destination, sameOrigin } from "@/lib/auth/policy";

export async function POST(request: NextRequest) {
  const { config, client, response } = authResponse(request);
  if (!config || !client) return response;
  if (!sameOrigin(request, config.origin)) return privateResponse(new NextResponse("Request not accepted.", { status: 403 }));
  const callback = new URL("/auth/callback", config.origin);
  callback.searchParams.set("next", destination(request.nextUrl.searchParams.get("next")));
  const { data, error } = await client.auth.signInWithOAuth({ provider: "google", options: {
    redirectTo: callback.toString(), skipBrowserRedirect: true,
    queryParams: { hd: "clearway.co", prompt: "select_account" },
  } });
  if (!error && data.url) response.headers.set("Location", data.url);
  return response;
}

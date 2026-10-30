import { NextResponse, type NextRequest } from "next/server";
import { facilitatorClient } from "./client";
import { authConfig, facilitatorCookie } from "./policy";

export function privateResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export function authResponse(request: NextRequest) {
  const config = authConfig();
  const response = privateResponse(NextResponse.redirect(new URL("/sign-in?error=unavailable", config?.origin || "https://live.clearway.co"), 303));
  const client = facilitatorClient({
    getAll: () => request.cookies.getAll(),
    setAll: values => { for (const { name, value, options } of values) {
      request.cookies.set(name, value);
      response.cookies.set(name, value, options);
    } },
  });
  return { config, response, client };
}

export function clearFacilitatorCookies(request: NextRequest, response: NextResponse) {
  for (const { name } of request.cookies.getAll()) {
    if (name === facilitatorCookie || name.startsWith(facilitatorCookie + ".") || name.startsWith(facilitatorCookie + "-")) {
      response.cookies.set(name, "", { path: "/", httpOnly: true, sameSite: "lax", secure: authConfig()?.secure, maxAge: 0 });
    }
  }
}

import { createServerClient } from "@supabase/ssr";
import type { CookieJar } from "@/lib/auth/client";
import { authConfig } from "@/lib/auth/policy";
export const tvCookie = "cw-tv";
export function tvClient(jar: CookieJar) {
  const config = authConfig(); if (!config) throw new Error("TV connection unavailable");
  return createServerClient(config.url, config.key, { cookies: jar,
    cookieOptions: { name: tvCookie, httpOnly: true, sameSite: "lax", path: "/", secure: config.secure, maxAge: 31536000 },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

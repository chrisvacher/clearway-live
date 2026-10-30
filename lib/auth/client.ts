import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { authConfig, facilitatorCookie } from "./policy";

export type CookieJar = {
  getAll(): { name: string; value: string }[];
  setAll(values: { name: string; value: string; options: CookieOptions }[]): void;
};

// No service key. Every application query uses the user's session and database RLS.
export function facilitatorClient(jar: CookieJar) {
  const config = authConfig();
  if (!config) return null;
  return createServerClient(config.url, config.key, {
    cookieOptions: { name: facilitatorCookie, path: "/", httpOnly: true, sameSite: "lax", secure: config.secure },
    cookies: jar,
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

export const facilitatorCookie = "cw-facilitator";

export function destination(value: string | null | undefined): "/setup" | "/control" {
  return value === "/control" ? "/control" : "/setup";
}

export function clearwayEmail(email: string | undefined): boolean {
  return typeof email === "string" && /^[^@\s]+@clearway\.co$/i.test(email);
}

export function authConfig(env: Record<string, string | undefined> = process.env) {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const origin = env.APP_ORIGIN || "https://live.clearway.co";
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    const app = new URL(origin);
    const local = (u: URL) => u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname);
    if ((parsed.protocol !== "https:" && !local(parsed)) || parsed.username || parsed.password
      || parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    if ((app.protocol !== "https:" && !local(app)) || app.origin !== origin) return null;
    // A misconfigured service key must never be used for user-authorized reads.
    if (!key.startsWith("sb_publishable_")) {
      const claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
      if (claims.role !== "anon") return null;
    }
    return { url: parsed.origin, key, origin, secure: app.protocol === "https:" };
  } catch { return null; }
}

export function sameOrigin(request: Request, origin: string): boolean {
  return request.headers.get("origin") === origin;
}

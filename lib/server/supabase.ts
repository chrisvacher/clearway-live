import "server-only";
import { createClient } from "@supabase/supabase-js";
import { authConfig } from "@/lib/auth/policy";

export function serviceClient() {
  const config = authConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!config || !key) throw new Error("Server connection unavailable");
  return createClient(config.url, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

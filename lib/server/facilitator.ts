import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { facilitatorClient } from "@/lib/auth/client";
import { clearwayEmail } from "@/lib/auth/policy";

export const getFacilitator = cache(async () => {
  const jar = await cookies();
  const client = facilitatorClient({ getAll: () => jar.getAll(), setAll: () => { /* Middleware refreshes cookies. */ } });
  if (!client) return null;
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user || !clearwayEmail(user.email)) return null;
  // RLS checks the real, current OAuth session, verified Google identity and active allowlist.
  const { data: profile, error: denied } = await client.from("clearway_users")
    .select("id,name,email,is_admin").eq("auth_user_id", user.id).eq("deleted", false).maybeSingle();
  return denied || !profile ? null : { profile: profile as { id: string; name: string; email: string; is_admin: boolean }, client };
});

export async function requireFacilitator() {
  const facilitator = await getFacilitator();
  if (!facilitator) redirect("/sign-in");
  return facilitator;
}

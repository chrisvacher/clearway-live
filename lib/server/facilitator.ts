import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { facilitatorClient } from "@/lib/auth/client";
import { clearwayEmail, linkGuestEmail } from "@/lib/auth/policy";

export const getFacilitator = cache(async () => {
  const jar = await cookies();
  const client = facilitatorClient({ getAll: () => jar.getAll(), setAll: () => { /* Middleware refreshes cookies. */ } });
  if (!client) return null;
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user || !(clearwayEmail(user.email) || linkGuestEmail(user.email))) return null;
  // RLS checks the real, current OAuth session, verified Google identity and active allowlist; for an event's link guest, that the
  // session came in by a code still live for its event.
  const { data: profile, error: denied } = await client.from("clearway_users")
    .select("id,name,email,is_admin,kind").eq("auth_user_id", user.id).eq("deleted", false).maybeSingle();
  return denied || !profile ? null : { profile: profile as { id: string; name: string; email: string; is_admin: boolean; kind: "person" | "link_guest" }, client };
});

export async function requireFacilitator() {
  const facilitator = await getFacilitator();
  if (!facilitator) redirect("/sign-in");
  return facilitator;
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { roomMutation } from "@/lib/live/mutation";
import { agreeBody, outboxStatus } from "./four-lists";

// A phone's Four Helpful Lists calls (agree, its own agrees), under its own room sign-in. phoneQa carries the cookies.
// Every rule is the database's; this only checks the shape.
const statusCode = (status: string) => ["accepted", "duplicate", "ok"].includes(status) ? 200 : status === "denied" ? 403 : ["closed", "conflict"].includes(status) ? 409 : 422;

export async function castAgree(client: SupabaseClient, engagement: string, raw: Record<string, unknown> | null) {
  const input = agreeBody(raw);
  if (!input) return { data: { status: "invalid_request" }, status: 422 };
  const { data, error } = await roomMutation(client, engagement, () => client.rpc("four_lists_agree", { p_engagement: engagement, p_id: input.id, p_card: input.card, p_revision: input.revision,
    p_on: input.on, p_sent: input.sentAt, p_queued: input.queuedAt, p_uncertainty: input.uncertaintyMs }));
  if (error) throw error;
  const status = outboxStatus(data.status);
  return { data: { ...data, status, reason: data.status }, status: statusCode(status) };
}
export async function myAgrees(client: SupabaseClient, engagement: string, session: string | null) {
  const { data, error } = await client.rpc("four_lists_my_agrees", { p_engagement: engagement, p_session: session });
  if (error) throw error;
  return { data, status: data.status === "ok" ? 200 : 403 };
}

// Whether this database has the Four Helpful Lists yet (its migration applied). Until then the run of show hides the Discover part and
// the review link, and the review says so quietly. A missing function is the only error that means "not yet".
export const fourListsMissing = (error: { code?: string; message?: string } | null) => Boolean(error && (error.code === "PGRST202" || error.code === "42883" || /could not find the function|does not exist/i.test(error.message ?? "")));
export async function fourListsAvailable(client: SupabaseClient, engagement: string) {
  const { error } = await client.rpc("four_lists_review", { p_engagement: engagement });
  return !fourListsMissing(error);
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { roomMutation } from "@/lib/live/mutation";
import { typeBody, typeStatusCode } from "./outcomes";

// A phone's typed bullet, under its own room sign-in. Every rule is the database's: the field
// lock, the word filter, the limits and the 120 ms window. "pending" says the room has not been
// told yet; the phone asks again with a nudge after wait_ms so the last keystrokes never wait.
export async function typeBullet(client: SupabaseClient, engagement: string, raw: Record<string, unknown> | null) {
  const input = typeBody(raw);
  if (!input) return { data: { status: "invalid_request" }, status: 422 };
  if (input.action === "nudge") {
    const { data, error } = await roomMutation(client, engagement, () => client.rpc("bullet_nudge", { p_engagement: engagement, p_session: input.session }));
    if (error) throw error;
    return { data, status: typeStatusCode(data.status) };
  }
  const { data, error } = await roomMutation(client, engagement, () => client.rpc("bullet_type", {
    p_engagement: engagement, p_id: input.id, p_session: input.session, p_outcome: input.outcome, p_text: input.text, p_seq: input.seq, p_revision: input.revision ?? null }));
  if (error) throw error;
  return { data, status: typeStatusCode(data.status) };
}

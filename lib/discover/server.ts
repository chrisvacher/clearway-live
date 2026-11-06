import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscoverState } from "./types";

// One read of the Discover page's state, under the facilitator's own sign-in. Null when the functions are not
// there yet (the migration has not been run) or the caller is not a facilitator of the engagement.
export async function readDiscover(client: SupabaseClient, engagement: string): Promise<{ state: DiscoverState | null; missing: boolean; denied: boolean }> {
  const { data, error } = await client.rpc("discover_state", { p_engagement: engagement });
  if (error) return { state: null, missing: true, denied: false };
  if (data?.status === "ok") return { state: data as DiscoverState, missing: false, denied: false };
  return { state: null, missing: false, denied: data?.status === "denied" };
}

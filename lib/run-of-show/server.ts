import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RunOfShow } from "./types";
import { sortSessions } from "./policy";

export async function readShow(client: SupabaseClient, engagement: string): Promise<RunOfShow | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let after: string | null = null, version: string | null = null, show: RunOfShow | null = null, changed = false;
    do {
      const response = await client.rpc("show_read", { p_engagement: engagement, p_after: after, p_version: version });
      const data = response.data as (RunOfShow & { status: string; next: string | null }) | null;
      const error = response.error;
      if (error || !data) throw new Error("Run of show unavailable");
      if (data.status === "denied") return null;
      if (data.status === "changed") { changed = true; break; }
      if (data.status !== "ok") throw new Error("Run of show unavailable");
      if (!show) show = { context: data.context, sessions: [], version: data.version };
      show.sessions.push(...data.sessions);
      version = data.version;
      if (data.next && data.next === after) throw new Error("Repeated page");
      after = data.next;
    } while (after);
    if (!changed && show) return { ...show, sessions: sortSessions(show.sessions) };
  }
  throw new Error("The run of show changed while loading. Please try again.");
}

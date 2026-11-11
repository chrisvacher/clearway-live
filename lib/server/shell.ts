import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShellEngagement } from "@/components/layout/shell-nav";

// What the app shell's sidebar needs to name an engagement and choose its pages.
export async function readShellEngagement(client: SupabaseClient, id: string): Promise<ShellEngagement | null> {
  const { data } = await client.from("engagements").select("id,title,type,church:churches!engagements_church_id_fkey(name)").eq("id", id).eq("deleted", false).maybeSingle();
  if (!data) return null;
  const church = data.church as unknown as { name: string } | null;
  return { id: data.id, title: data.title, type: data.type, church: church?.name ?? "Church not named" };
}

// A workshop has no Discover, overnight review, report, visibility plan, read-only copy or check-ins. A link to one of those pages
// goes to the page a workshop has in its place.
export async function wayfindingOnly(client: SupabaseClient, id: string, instead: string) {
  const { data } = await client.from("engagements").select("type").eq("id", id).eq("deleted", false).maybeSingle();
  if (data?.type === "team_workshop") redirect(instead);
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShellEngagement } from "@/components/layout/shell-nav";

// What the app shell's sidebar needs to name an engagement and choose its pages.
export async function readShellEngagement(client: SupabaseClient, id: string): Promise<ShellEngagement | null> {
  const { data } = await client.from("engagements").select("id,title,type,church:churches!engagements_church_id_fkey(name)").eq("id", id).eq("deleted", false).maybeSingle();
  if (!data) return null;
  const church = data.church as unknown as { name: string } | null;
  return { id: data.id, title: data.title, type: data.type, church: church?.name ?? "Church not named" };
}

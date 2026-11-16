import "server-only";
import { serviceClient } from "@/lib/server/supabase";
import { imageBucket } from "./shared";

// The files of images whose engagement was deleted, removed from Storage by the operations sweep, a batch at a time.
export async function purgeDeletedImages(limit = 200) {
  const db = serviceClient();
  const { data, error } = await db.rpc("image_purge_list", { p_limit: limit });
  if (error) throw error;
  const list = (data ?? []) as { id: string; path: string }[];
  if (!list.length) return { purged: 0 };
  const removed = await db.storage.from(imageBucket).remove(list.map(x => x.path));
  if (removed.error) throw removed.error;
  const marked = await db.rpc("image_purged", { p_ids: list.map(x => x.id) });
  if (marked.error) throw marked.error;
  return { purged: Number(marked.data) || 0 };
}

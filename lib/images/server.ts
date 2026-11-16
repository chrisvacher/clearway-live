import "server-only";
import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server/supabase";
import { privateResponse } from "@/lib/auth/response";
import { uuid } from "@/lib/room/identity";
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

// The Home loop for phones that haven't joined yet (LP-1): only while Home is on the TV and the engagement is open.
// Ids and timing only; each image comes through the image route, which checks it is still one of these.
export async function joinHome(engagement: string) {
  const answer = (data: Record<string, unknown>, status = 200) => privateResponse(NextResponse.json(data, { status }));
  if (!uuid(engagement)) return answer({ status: "invalid_request" }, 404);
  try {
    const { data, error } = await serviceClient().rpc("home_join", { p_engagement: engagement });
    if (error) throw error;
    if (!data) return answer({ status: "missing" }, 404);
    return answer(data);
  } catch { return answer({ status: "unavailable" }, 503); }
}

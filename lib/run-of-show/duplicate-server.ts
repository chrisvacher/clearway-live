import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/server/supabase";
import { uuid } from "@/lib/room/identity";
import { imageBucket } from "@/lib/images/shared";
import { videoBucket } from "@/lib/video/files";

export type DuplicateFlags = { replace: boolean; media: boolean; times: boolean; visibility: boolean };
type FilePlan = { id: string; path: string; bucket: typeof imageBucket | typeof videoBucket };
export type DuplicateOutcome = { status: string; id?: string; title?: string; copied?: number };

async function copyReferencedFiles(source: string, target: string, files: FilePlan[], commit: (map: Record<string, string>) => Promise<DuplicateOutcome>): Promise<DuplicateOutcome> {
  const copied: { bucket: FilePlan["bucket"]; path: string }[] = [];
  const map: Record<string, string> = {};
  const storage = files.length ? serviceClient().storage : null;
  const clean = async () => {
    if (!storage) return;
    await Promise.allSettled([imageBucket, videoBucket].map(async bucket => {
      const paths = copied.filter(file => file.bucket === bucket).map(file => file.path);
      if (paths.length) await storage.from(bucket).remove(paths);
    }));
  };
  try {
    for (const file of files) {
      const ext = /\.(png|jpg|jpeg|webp|mp4|mov)$/i.exec(file.path)?.[0];
      if (file.bucket !== imageBucket && file.bucket !== videoBucket || !uuid(file.id) || !file.path.startsWith(`${source}/`) || !ext) throw new Error("Invalid file plan");
      const id = crypto.randomUUID();
      const destination = `${target}/${id}${ext}`;
      const result = await storage!.from(file.bucket).copy(file.path, destination);
      if (result.error) throw result.error;
      copied.push({ bucket: file.bucket, path: destination });
      map[file.id] = id;
    }
  } catch { await clean(); return { status: "media_unavailable" }; }

  // The database repeats live state, permission and version checks after the file copy.
  // An ambiguous network error could already have committed, so leave those objects in place.
  const done = await commit(map);
  if (done.status !== "ok") await clean();
  return done;
}

export async function duplicateShow(client: SupabaseClient, source: string, target: string, flags: DuplicateFlags): Promise<DuplicateOutcome> {
  const keys = { p_source: source, p_target: target, p_replace: flags.replace, p_media: flags.media };
  const { data, error } = await client.rpc("duplicate_show_plan", keys);
  if (error) throw error;
  if (data.status !== "ok") return { status: data.status };
  return copyReferencedFiles(source, target, data.files, async files => {
    const done = await client.rpc("duplicate_run_of_show", { ...keys, p_times: flags.times, p_visibility: flags.visibility, p_version: data.version, p_target_version: data.target_version, p_files: files });
    if (done.error) throw done.error;
    return done.data as DuplicateOutcome;
  });
}

export async function duplicateEvent(client: SupabaseClient, source: string): Promise<DuplicateOutcome> {
  const { data, error } = await client.rpc("duplicate_event_plan", { p_source: source });
  if (error) throw error;
  if (data.status !== "ok") return { status: data.status };
  const target = crypto.randomUUID();
  return copyReferencedFiles(source, target, data.files, async files => {
    const done = await client.rpc("duplicate_event_with_media", { p_source: source, p_target: target, p_version: data.version, p_files: files });
    if (done.error) throw done.error;
    return done.data as DuplicateOutcome;
  });
}

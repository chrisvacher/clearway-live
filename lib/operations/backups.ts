import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { serviceClient } from "@/lib/server/supabase";
type DB = ReturnType<typeof serviceClient>;
type Candidate = { id: string; path: string; name: string; content_type: string; bytes: number; source_version: string };
const chunkSize = 1048576;
export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function rpc(db: DB, name: string, args?: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error("Backup operation unavailable");
  return data;
}
export async function protectFile(db: DB, file: Candidate, probe?: string) {
  const blob = await db.storage.from("scribe").download(file.path);
  if (blob.error || !blob.data) throw new Error("Source file unavailable");
  if (blob.data.size !== Number(file.bytes) || blob.data.size > 15728640) throw new Error("Source size changed");
  const bytes = Buffer.from(await blob.data.arrayBuffer());
  const backup = await rpc(db, "ops_backup_begin", { p_file: probe ? null : file.id, p_source: file.source_version,
    p_sha: sha256(bytes), p_bytes: bytes.length, p_probe: probe || null });
  if (!["pending", "complete"].includes(backup.status)) throw new Error("Source version changed");
  if (backup.status !== "complete") {
    for (let part = 0; part < backup.parts; part++) {
      if (!await rpc(db, "ops_backup_put", { p_backup: backup.id, p_part: part, p_data: bytes.subarray(part * chunkSize, (part + 1) * chunkSize).toString("base64") })) throw new Error("Backup chunk refused");
    }
    if (!await rpc(db, "ops_backup_finish", { p_backup: backup.id })) throw new Error("Backup checksum differs");
  }
  return { id: String(backup.id), sha256: sha256(bytes), bytes: bytes.length };
}
export async function runFileBackups(fileId?: string) {
  const db = serviceClient(), run = await rpc(db, "ops_backup_run");
  let copied = 0, failed = 0;
  try {
    const files: Candidate[] = await rpc(db, "ops_backup_candidates", { p_file: fileId || null });
    for (const file of files) {
      try { await protectFile(db, file); copied++; } catch { failed++; }
    }
  } catch { failed++; }
  await rpc(db, "ops_backup_run", { p_run: run, p_copied: copied, p_failed: failed });
  return { copied, failed };
}
export async function recoveredBytes(db: DB, id: string): Promise<Buffer> {
  const first = await rpc(db, "ops_backup_chunk", { p_backup: id, p_part: 0 });
  if (first.status !== "ok" || !first.data) throw new Error("Backup unavailable");
  const chunks = [Buffer.from(first.data, "base64")];
  for (let part = 1; part < first.parts; part++) {
    const next = await rpc(db, "ops_backup_chunk", { p_backup: id, p_part: part });
    if (next.status !== "ok" || !next.data) throw new Error("Backup incomplete");
    chunks.push(Buffer.from(next.data, "base64"));
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.length !== first.bytes || sha256(bytes) !== first.sha256) throw new Error("Backup checksum differs");
  return bytes;
}
// A fixed harmless file only, never an engagement file. Demonstrate loss and recovery without touching church records.
export async function verifyFileRecovery() {
  const db = serviceClient(), run = await rpc(db, "ops_backup_run");
  const path = "operations-probe/" + run + "/backup-check.txt";
  const bytes = Buffer.from("Clearway Live file backup verification v1\n" + randomUUID() + "\n");
  try {
    const put = await db.storage.from("scribe").upload(path, bytes, { contentType: "text/plain", upsert: false });
    if (put.error) throw new Error("Probe upload unavailable");
    const version = await rpc(db, "ops_probe_source", { p_run: run });
    const backup = await protectFile(db, { id: run, path, name: "backup-check.txt", content_type: "text/plain", bytes: bytes.length, source_version: version }, run);
    const remove = await db.storage.from("scribe").remove([path]);
    if (remove.error) throw new Error("Probe removal unavailable");
    // The recovery read is deliberately after the original has been removed.
    const restored = await recoveredBytes(db, backup.id);
    if (!restored.equals(bytes)) throw new Error("Recovery differs");
    const reupload = await db.storage.from("scribe").upload(path, restored, { contentType: "text/plain", upsert: false });
    if (reupload.error) throw new Error("Probe recovery unavailable");
    const check = await db.storage.from("scribe").download(path);
    if (check.error || !check.data || sha256(Buffer.from(await check.data.arrayBuffer())) !== backup.sha256) throw new Error("Recovered source differs");
    await rpc(db, "ops_backup_run", { p_run: run, p_copied: 1, p_verified: true });
    return backup;
  } catch {
    await rpc(db, "ops_backup_run", { p_run: run, p_failed: 1 });
    throw new Error("File recovery check unavailable");
  } finally {
    const cleanup = await db.storage.from("scribe").remove([path]).catch(() => ({ error: true }));
    if (cleanup.error) {
      await rpc(db, "ops_backup_run", { p_run: run, p_failed: 1 });
      throw new Error("Recovery test cleanup unavailable");
    }
  }
}

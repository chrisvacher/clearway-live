// The overnight draft's worker (milestone 5, step 2). When Day 1 closes the database opens one round for the
// engagement; this claims it (one lease, held by the database), reads the easel photos from the private bucket,
// asks the deeper model once, and hands the reply to overnight_apply, which keeps only what is sourced. A failure
// is recorded and retried after a pause, three times; then the review screen says so and the facilitators write
// the draft by hand. It uses the same run log as the live jobs (ai_runs).
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiConfig, costUsd, type AiConfig } from "./config";
import type { AiClient, AiImage } from "./client";
import { overnightPrompt, overnightVersion, type OvernightInputs } from "./prompts";
import { rawChars } from "./worker";

export type OvernightClaim = { status: "claimed"; run: string; job: "overnight_draft"; prompt_version: string; inputs: OvernightInputs } | { status: "idle" | "busy" | "off" | "cooling" | "missing" | "invalid_request"; ms?: number };
export type OvernightReport = { engagement: string; status: string; ms: number };
const maxPhotoBytes = 5 * 1024 * 1024, maxImages = 8, maxTotalBytes = 18 * 1024 * 1024;
const mediaTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

// The photos the model can read, as base64, with the refs of any it could not fetch.
export async function loadPhotos(db: SupabaseClient, photos: OvernightInputs["photos"]) {
  const images: AiImage[] = [], sent: string[] = [], missed: string[] = [];
  let total = 0;
  for (const p of photos) {
    if (p.typed) continue;
    if (!p.readable || !mediaTypes.has(p.type) || p.bytes > maxPhotoBytes || images.length >= maxImages || total + p.bytes > maxTotalBytes) { missed.push(p.ref); continue; }
    try {
      const blob = await db.storage.from("scribe").download(p.path);
      if (blob.error || !blob.data) { missed.push(p.ref); continue; }
      const bytes = Buffer.from(await blob.data.arrayBuffer());
      if (!bytes.length || bytes.length > maxPhotoBytes) { missed.push(p.ref); continue; }
      total += bytes.length; images.push({ type: p.type as AiImage["type"], data: bytes.toString("base64") }); sent.push(p.ref);
    } catch { missed.push(p.ref); }
  }
  return { images, sent, missed };
}

export async function runOvernight(db: SupabaseClient, ai: AiClient, engagement: string, config: AiConfig = aiConfig(), deadline = Date.now() + config.deepBudgetMs): Promise<OvernightReport> {
  const lease = randomUUID(), deep: AiConfig = { ...config, model: config.deepModel }, started = Date.now();
  const claimed = await db.rpc("overnight_claim", { p_engagement: engagement, p_lease: lease, p_model: ai.model(deep), p_versions: { overnight_draft: overnightVersion } });
  if (claimed.error) return { engagement, status: "unavailable", ms: 0 };
  const claim = claimed.data as OvernightClaim;
  if (claim.status !== "claimed") return { engagement, status: claim.status, ms: 0 };
  try {
    if (overnightPrompt.version !== claim.prompt_version) throw new Error("prompt_version");
    const { images, sent, missed } = await loadPhotos(db, claim.inputs.photos);
    const timeoutMs = Math.max(1000, Math.min(config.deepTimeoutMs, deadline - Date.now()));
    const reply = await ai.complete({ system: overnightPrompt.system, user: overnightPrompt.user(claim.inputs, sent), maxTokens: overnightPrompt.maxTokens, timeoutMs, images }, deep);
    const ms = Date.now() - started, output = overnightPrompt.parse(reply.text, claim.inputs);
    for (const photo of missed) if (!output.unreadable.some(u => u.photo === photo && !u.outcome)) output.unreadable.push({ photo });
    const { data, error } = await db.rpc("overnight_apply", { p_run: claim.run, p_lease: lease, p_output: { ...output, raw: reply.text.slice(0, rawChars) },
      p_usage: { input_tokens: reply.inputTokens, output_tokens: reply.outputTokens, cost_usd: costUsd(deep, reply.inputTokens, reply.outputTokens), ms } });
    if (error) { await db.rpc("overnight_fail", { p_run: claim.run, p_lease: lease, p_error: "unavailable", p_usage: { ms } }); return { engagement, status: "unavailable", ms }; }
    return { engagement, status: String(data?.status), ms };
  } catch (error) {
    const ms = Date.now() - started, reason = error instanceof Error && /timeout|timed out|abort/i.test(error.message + error.name) ? "timeout" : "unavailable";
    await db.rpc("overnight_fail", { p_run: claim.run, p_lease: lease, p_error: reason, p_usage: { ms } });
    return { engagement, status: reason, ms };
  }
}

// One overnight worker per engagement in this process; across servers the database lease does the same.
const running = new Map<string, Promise<OvernightReport>>();
export function workOvernight(db: SupabaseClient, ai: AiClient, engagement: string, config: AiConfig = aiConfig()) {
  const current = running.get(engagement);
  if (current) return current;
  const work = runOvernight(db, ai, engagement, config).catch((): OvernightReport => ({ engagement, status: "unavailable", ms: 0 })).finally(() => running.delete(engagement));
  running.set(engagement, work);
  return work;
}

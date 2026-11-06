// The What We Heard worker (milestone 6, step 4). When the facilitator presses Draft What We Heard the database holds one pending round for
// the engagement; this claims it (one lease, held by the database), asks the deeper model once, and hands the reply to discover_heard_apply,
// which keeps only what is sourced, uses the lead theme's own figure for the number and refuses any name. One failure is retried after a pause;
// a second is recorded and the page says so, and the facilitator types the headlines by hand. It uses the same run log as the live jobs
// (ai_runs). Nothing here reaches the room: the facilitator edits each draft and applies it, and the step goes live as usual.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiConfig, costUsd, type AiConfig } from "./config";
import type { AiClient } from "./client";
import { heardPrompt, heardVersion, type HeardInputs } from "./prompts";
import { rawChars } from "./worker";

export type HeardClaim = { status: "claimed"; run: string; job: "draft_what_we_heard"; prompt_version: string; inputs: HeardInputs } | { status: "idle" | "busy" | "off" | "cooling" | "missing" | "invalid_request"; ms?: number };
export type HeardReport = { engagement: string; status: string; ms: number };

export const heardTimeoutMs = (config: AiConfig) => Math.min(280000, Math.max(config.deepTimeoutMs, 60000));
export const heardBudgetMs = (config: AiConfig) => Math.min(290000, Math.max(config.deepBudgetMs, 70000));

export async function runHeard(db: SupabaseClient, ai: AiClient, engagement: string, config: AiConfig = aiConfig(), deadline = Date.now() + heardBudgetMs(config)): Promise<HeardReport> {
  const lease = randomUUID(), deep: AiConfig = { ...config, model: config.deepModel }, started = Date.now();
  const claimed = await db.rpc("discover_heard_claim", { p_engagement: engagement, p_lease: lease, p_model: ai.model(deep), p_versions: { draft_what_we_heard: heardVersion } });
  if (claimed.error) return { engagement, status: "unavailable", ms: 0 };
  const claim = claimed.data as HeardClaim;
  if (claim.status !== "claimed") return { engagement, status: claim.status, ms: 0 };
  try {
    if (heardPrompt.version !== claim.prompt_version) throw new Error("prompt_version");
    const timeoutMs = Math.max(1000, Math.min(heardTimeoutMs(config), deadline - Date.now()));
    const reply = await ai.complete({ system: heardPrompt.system, user: heardPrompt.user(claim.inputs), maxTokens: heardPrompt.maxTokens, timeoutMs }, deep);
    const ms = Date.now() - started, output = heardPrompt.parse(reply.text, claim.inputs);
    const { data, error } = await db.rpc("discover_heard_apply", { p_run: claim.run, p_lease: lease, p_output: { ...output, raw: reply.text.slice(0, rawChars) },
      p_usage: { input_tokens: reply.inputTokens, output_tokens: reply.outputTokens, cost_usd: costUsd(deep, reply.inputTokens, reply.outputTokens), ms } });
    if (error) { await db.rpc("discover_heard_fail", { p_run: claim.run, p_lease: lease, p_error: "unavailable", p_usage: { ms } }); return { engagement, status: "unavailable", ms }; }
    return { engagement, status: String(data?.status), ms };
  } catch (error) {
    const ms = Date.now() - started, reason = error instanceof Error && /timeout|timed out|abort/i.test(error.message + error.name) ? "timeout" : "unavailable";
    await db.rpc("discover_heard_fail", { p_run: claim.run, p_lease: lease, p_error: reason, p_usage: { ms } });
    return { engagement, status: reason, ms };
  }
}

// One What We Heard worker per engagement in this process; across servers the database lease does the same.
const running = new Map<string, Promise<HeardReport>>();
export function workHeard(db: SupabaseClient, ai: AiClient, engagement: string, config: AiConfig = aiConfig()) {
  const current = running.get(engagement);
  if (current) return current;
  const work = runHeard(db, ai, engagement, config).catch((): HeardReport => ({ engagement, status: "unavailable", ms: 0 })).finally(() => running.delete(engagement));
  running.set(engagement, work);
  return work;
}

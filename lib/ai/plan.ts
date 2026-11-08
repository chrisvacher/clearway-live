// The visibility plan worker (milestone 7, step 3). When the facilitator presses Draft the plan the database holds one pending round. This claims it
// (one lease, held by the database), asks the deeper model once with the plan prompt, and hands the reply to visibility_plan_apply, which keeps only what
// the code checks allow. A failed call is tried once more after a pause; a second failure marks the plan Needs attention and the facilitator adds rows
// by hand or presses Draft the plan again. It uses the same run log as the other jobs (ai_runs, no session). Nothing here reaches the room.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiConfig, costUsd, type AiConfig } from "./config";
import type { AiClient } from "./client";
import { planPrompt, planVersion, type PlanInputs } from "./prompts";
import { rawChars } from "./worker";

export type PlanClaim = { status: "claimed"; run: string; job: "draft_visibility_plan"; prompt_version: string; inputs: PlanInputs } | { status: "idle" | "busy" | "off" | "cooling" | "missing" | "invalid_request"; ms?: number };
export type PlanReport = { engagement: string; status: string; ms: number };

export const planTimeoutMs = (config: AiConfig) => Math.min(280000, Math.max(config.deepTimeoutMs, 60000));
export const planBudgetMs = (config: AiConfig) => Math.min(290000, Math.max(config.deepBudgetMs, 70000));

export async function runPlan(db: SupabaseClient, ai: AiClient, engagement: string, config: AiConfig = aiConfig(), deadline = Date.now() + planBudgetMs(config)): Promise<PlanReport> {
  const deep: AiConfig = { ...config, model: config.deepModel }, begun = Date.now();
  let status = "idle";
  while (Date.now() < deadline - 2000) {
    const lease = randomUUID(), started = Date.now();
    const claimed = await db.rpc("visibility_plan_claim", { p_engagement: engagement, p_lease: lease, p_model: ai.model(deep), p_versions: { draft_visibility_plan: planVersion } });
    if (claimed.error) { status = "unavailable"; break; }
    const claim = claimed.data as PlanClaim;
    if (claim.status !== "claimed") { status = claim.status; break; }
    status = "ok";
    try {
      if (planVersion !== claim.prompt_version) throw new Error("prompt_version");
      const timeoutMs = Math.max(1000, Math.min(planTimeoutMs(config), deadline - Date.now()));
      const reply = await ai.complete({ system: planPrompt.system, user: planPrompt.user(claim.inputs), maxTokens: planPrompt.maxTokens, timeoutMs }, deep);
      const ms = Date.now() - started, output = planPrompt.parse(reply.text, claim.inputs);
      const { error } = await db.rpc("visibility_plan_apply", { p_run: claim.run, p_lease: lease, p_output: { ...output, prompt: planPrompt.version, raw: reply.text.slice(0, rawChars) },
        p_usage: { input_tokens: reply.inputTokens, output_tokens: reply.outputTokens, cost_usd: costUsd(deep, reply.inputTokens, reply.outputTokens), ms } });
      if (error) { await db.rpc("visibility_plan_fail", { p_run: claim.run, p_lease: lease, p_error: "unavailable", p_usage: { ms } }); status = "unavailable"; }
    } catch (error) {
      const ms = Date.now() - started, reason = error instanceof Error && /timeout|timed out|abort/i.test(error.message + error.name) ? "timeout" : "unavailable";
      await db.rpc("visibility_plan_fail", { p_run: claim.run, p_lease: lease, p_error: reason, p_usage: { ms } });
      status = reason;
    }
    break; // One run makes the plan. The page's poll asks again if the database wants a second try after its pause.
  }
  return { engagement, status, ms: Date.now() - begun };
}

// One plan worker per engagement in this process; across servers the database lease does the same.
const running = new Map<string, Promise<PlanReport>>();
export function workPlan(db: SupabaseClient, ai: AiClient, engagement: string, config: AiConfig = aiConfig()) {
  const current = running.get(engagement);
  if (current) return current;
  const work = runPlan(db, ai, engagement, config).catch((): PlanReport => ({ engagement, status: "unavailable", ms: 0 })).finally(() => running.delete(engagement));
  running.set(engagement, work);
  return work;
}

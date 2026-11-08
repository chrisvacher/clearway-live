// The Wayfinding report worker (milestone 7, step 1). When the facilitator presses Draft the report the database holds one pending round with a queue
// of sections. This claims one section at a time (one lease, held by the database), asks the deeper model once for it with that section's own prompt,
// and hands the reply to report_apply, which keeps only what the code checks allow. A section that fails is tried once more after a pause; a second
// failure marks it Needs attention and the round moves on, and the facilitator retries it with Redraft section. It uses the same run log as the other
// jobs (ai_runs, no session). Nothing here reaches the room: the report is the facilitator's to edit, review and sign off.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiConfig, costUsd, type AiConfig } from "./config";
import type { AiClient } from "./client";
import { reportKeys, reportPrompts, reportVersion, type ReportInputs, type ReportKey } from "./prompts";
import { rawChars } from "./worker";

export type ReportClaim = { status: "claimed"; run: string; job: "draft_report"; prompt_version: string; section: string; inputs: ReportInputs } | { status: "idle" | "busy" | "off" | "cooling" | "missing" | "invalid_request"; ms?: number };
export type ReportReport = { engagement: string; status: string; sections: number; ms: number };

export const reportTimeoutMs = (config: AiConfig) => Math.min(280000, Math.max(config.deepTimeoutMs, 60000));
export const reportBudgetMs = (config: AiConfig) => Math.min(290000, Math.max(config.deepBudgetMs, 70000));

// Draft every section this trigger has time for. A section the budget cannot reach stays queued, and the page's next poll starts the worker again.
export async function runReport(db: SupabaseClient, ai: AiClient, engagement: string, config: AiConfig = aiConfig(), deadline = Date.now() + reportBudgetMs(config)): Promise<ReportReport> {
  const deep: AiConfig = { ...config, model: config.deepModel }, begun = Date.now();
  let sections = 0, status = "idle";
  while (Date.now() < deadline - 2000) {
    const lease = randomUUID(), started = Date.now();
    const claimed = await db.rpc("report_claim", { p_engagement: engagement, p_lease: lease, p_model: ai.model(deep), p_versions: { draft_report: reportVersion } });
    if (claimed.error) { status = "unavailable"; break; }
    const claim = claimed.data as ReportClaim;
    if (claim.status !== "claimed") { status = claim.status; break; }
    status = "ok";
    const key = claim.section as ReportKey, prompt = reportKeys.includes(key) ? reportPrompts[key] : null;
    try {
      if (!prompt || reportVersion !== claim.prompt_version) throw new Error("prompt_version");
      const timeoutMs = Math.max(1000, Math.min(reportTimeoutMs(config), deadline - Date.now()));
      const reply = await ai.complete({ system: prompt.system, user: prompt.user(claim.inputs), maxTokens: prompt.maxTokens, timeoutMs }, deep);
      const ms = Date.now() - started, output = prompt.parse(reply.text, claim.inputs);
      const { error } = await db.rpc("report_apply", { p_run: claim.run, p_lease: lease, p_output: { ...output, prompt: prompt.version, raw: reply.text.slice(0, rawChars) },
        p_usage: { input_tokens: reply.inputTokens, output_tokens: reply.outputTokens, cost_usd: costUsd(deep, reply.inputTokens, reply.outputTokens), ms } });
      if (error) { await db.rpc("report_fail", { p_run: claim.run, p_lease: lease, p_error: "unavailable", p_usage: { ms } }); status = "unavailable"; break; }
      sections++;
    } catch (error) {
      const ms = Date.now() - started, reason = error instanceof Error && /timeout|timed out|abort/i.test(error.message + error.name) ? "timeout" : "unavailable";
      await db.rpc("report_fail", { p_run: claim.run, p_lease: lease, p_error: reason, p_usage: { ms } });
      // The pause before the second try is the database's: the next claim answers cooling, and the page's poll asks again.
      status = reason;
    }
  }
  return { engagement, status, sections, ms: Date.now() - begun };
}

// One report worker per engagement in this process; across servers the database lease does the same.
const running = new Map<string, Promise<ReportReport>>();
export function workReport(db: SupabaseClient, ai: AiClient, engagement: string, config: AiConfig = aiConfig()) {
  const current = running.get(engagement);
  if (current) return current;
  const work = runReport(db, ai, engagement, config).catch((): ReportReport => ({ engagement, status: "unavailable", sections: 0, ms: 0 })).finally(() => running.delete(engagement));
  running.set(engagement, work);
  return work;
}

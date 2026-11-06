// The Discover themes worker (milestone 6, step 3). When the facilitator presses Draft themes the database holds one pending round for
// the engagement; this claims it (one lease, held by the database), asks the deeper model once, and hands the reply to
// discover_theme_apply, which keeps only what is sourced, word for word and free of names. One failure is retried after a pause; a second
// is recorded and the page says so, and the facilitator adds themes by hand. It uses the same run log as the live jobs (ai_runs).
// Nothing here reaches the room: the facilitator accepts each theme.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiConfig, costUsd, type AiConfig } from "./config";
import type { AiClient } from "./client";
import { themesPrompt, themesVersion, type ThemesInputs } from "./prompts";
import { rawChars } from "./worker";

export type ThemesClaim = { status: "claimed"; run: string; job: "draft_discover_themes"; prompt_version: string; inputs: ThemesInputs } | { status: "idle" | "busy" | "off" | "cooling" | "missing" | "invalid_request"; ms?: number };
export type ThemesReport = { engagement: string; status: string; ms: number };

// Long notes make a long call, so the themes job gets at least 90 seconds, whatever the live timeout is.
export const themesTimeoutMs = (config: AiConfig) => Math.min(280000, Math.max(config.deepTimeoutMs, 90000));
export const themesBudgetMs = (config: AiConfig) => Math.min(290000, Math.max(config.deepBudgetMs, 100000));

export async function runThemes(db: SupabaseClient, ai: AiClient, engagement: string, config: AiConfig = aiConfig(), deadline = Date.now() + themesBudgetMs(config)): Promise<ThemesReport> {
  const lease = randomUUID(), deep: AiConfig = { ...config, model: config.deepModel }, started = Date.now();
  const claimed = await db.rpc("discover_theme_claim", { p_engagement: engagement, p_lease: lease, p_model: ai.model(deep), p_versions: { draft_discover_themes: themesVersion } });
  if (claimed.error) return { engagement, status: "unavailable", ms: 0 };
  const claim = claimed.data as ThemesClaim;
  if (claim.status !== "claimed") return { engagement, status: claim.status, ms: 0 };
  try {
    if (themesPrompt.version !== claim.prompt_version) throw new Error("prompt_version");
    const timeoutMs = Math.max(1000, Math.min(themesTimeoutMs(config), deadline - Date.now()));
    const reply = await ai.complete({ system: themesPrompt.system, user: themesPrompt.user(claim.inputs), maxTokens: themesPrompt.maxTokens, timeoutMs }, deep);
    const ms = Date.now() - started, output = themesPrompt.parse(reply.text, claim.inputs);
    const { data, error } = await db.rpc("discover_theme_apply", { p_run: claim.run, p_lease: lease, p_output: { ...output, raw: reply.text.slice(0, rawChars) },
      p_usage: { input_tokens: reply.inputTokens, output_tokens: reply.outputTokens, cost_usd: costUsd(deep, reply.inputTokens, reply.outputTokens), ms } });
    if (error) { await db.rpc("discover_theme_fail", { p_run: claim.run, p_lease: lease, p_error: "unavailable", p_usage: { ms } }); return { engagement, status: "unavailable", ms }; }
    return { engagement, status: String(data?.status), ms };
  } catch (error) {
    const ms = Date.now() - started, reason = error instanceof Error && /timeout|timed out|abort/i.test(error.message + error.name) ? "timeout" : "unavailable";
    await db.rpc("discover_theme_fail", { p_run: claim.run, p_lease: lease, p_error: reason, p_usage: { ms } });
    return { engagement, status: reason, ms };
  }
}

// One themes worker per engagement in this process; across servers the database lease does the same.
const running = new Map<string, Promise<ThemesReport>>();
export function workThemes(db: SupabaseClient, ai: AiClient, engagement: string, config: AiConfig = aiConfig()) {
  const current = running.get(engagement);
  if (current) return current;
  const work = runThemes(db, ai, engagement, config).catch((): ThemesReport => ({ engagement, status: "unavailable", ms: 0 })).finally(() => running.delete(engagement));
  running.set(engagement, work);
  return work;
}

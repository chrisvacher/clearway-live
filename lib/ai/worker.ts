// The AI worker (PRD "AI is never in the path from phone to TV"). It runs on the server
// after a response has gone: the answer was stored and broadcast already. It claims the
// work due for a session (one lease at a time, held by the database), calls the model,
// and hands the reply to the database, which applies it under the merge limits and raises
// one room version, so the merge, group or summary reaches every screen as its own event.
// It keeps claiming until nothing is due, so answers that arrived during a call are picked
// up by the next one. A failure or timeout is recorded and the room carries on.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiConfig, costUsd, type AiConfig } from "./config";
import type { AiClient } from "./client";
import { prompts, promptVersions, type AiInputs, type AiJob } from "./prompts";

export type Claim = { status: "claimed"; run: string; job: AiJob; prompt_version: string; inputs: AiInputs } | { status: "idle" | "busy" | "off" | "cooling" | "missing" | "invalid_request"; ms?: number };
export type RunReport = { session: string; runs: { job: AiJob; status: string; ms: number }[]; stopped: string };
// The model's own reply is kept with the run (inside ai_runs.output.result), so a reply the
// parser could not read can be looked at afterward. It holds only what the model wrote.
export const rawChars = 8000;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function runSession(db: SupabaseClient, ai: AiClient, session: string, config: AiConfig = aiConfig(), deadline = Date.now() + config.budgetMs): Promise<RunReport> {
  const report: RunReport = { session, runs: [], stopped: "deadline" };
  for (let i = 0; i < 20 && Date.now() < deadline; i++) {
    const lease = randomUUID(), model = ai.model(config);
    const claimed = await db.rpc("ai_claim", { p_session: session, p_lease: lease, p_model: model, p_versions: promptVersions });
    if (claimed.error) { report.stopped = "unavailable"; return report; }
    const claim = claimed.data as Claim;
    if (claim.status !== "claimed") { report.stopped = claim.status; return report; }
    const prompt = prompts[claim.job], started = Date.now();
    try {
      if (prompt.version !== claim.prompt_version) throw new Error("prompt_version");
      const timeoutMs = Math.max(1000, Math.min(config.timeoutMs, deadline - Date.now()));
      const reply = await ai.complete({ system: prompt.system, user: prompt.user(claim.inputs), maxTokens: prompt.maxTokens, timeoutMs }, config);
      const ms = Date.now() - started;
      const { data, error } = await db.rpc("ai_apply", { p_run: claim.run, p_lease: lease, p_output: { ...prompt.parse(reply.text, claim.inputs), raw: reply.text.slice(0, rawChars) },
        p_usage: { input_tokens: reply.inputTokens, output_tokens: reply.outputTokens, cost_usd: costUsd(config, reply.inputTokens, reply.outputTokens), ms } });
      report.runs.push({ job: claim.job, status: error ? "unavailable" : String(data?.status), ms });
      // An apply that could not commit releases its lease, so the next trigger can try again.
      if (error) { await db.rpc("ai_fail", { p_run: claim.run, p_lease: lease, p_error: "unavailable", p_usage: { ms } }); report.stopped = "unavailable"; return report; }
    } catch (error) {
      const ms = Date.now() - started, reason = error instanceof Error && /timeout|timed out|abort/i.test(error.message + error.name) ? "timeout" : "unavailable";
      await db.rpc("ai_fail", { p_run: claim.run, p_lease: lease, p_error: reason, p_usage: { ms } });
      report.runs.push({ job: claim.job, status: reason, ms });
      report.stopped = "failed";
      return report;
    }
  }
  return report;
}

// One worker per session in this process; a trigger while one runs asks it to go round
// again instead of starting another. Across servers the database lease does the same.
const running = new Map<string, { again: boolean; done: Promise<void> }>();
export function workSessions(db: SupabaseClient, ai: AiClient, sessions: string[], config: AiConfig = aiConfig()) {
  return Promise.all([...new Set(sessions)].map(session => {
    const current = running.get(session);
    if (current) { current.again = true; return current.done; }
    const state = { again: false, done: Promise.resolve() };
    state.done = (async () => {
      const deadline = Date.now() + config.budgetMs;
      try {
        if (config.debounceMs) await sleep(config.debounceMs);
        do { state.again = false; await runSession(db, ai, session, config, deadline); } while (state.again && Date.now() < deadline);
      } catch (error) {
        console.error("AI work unavailable", { code: error instanceof Error ? error.name : "failed" });
      } finally { running.delete(session); }
    })();
    running.set(session, state);
    return state.done;
  }));
}

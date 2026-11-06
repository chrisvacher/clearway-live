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

export type Claim = { status: "claimed"; run: string; job: AiJob; prompt_version: string; inputs: AiInputs } | { status: "idle" | "busy" | "off" | "cooling" | "wait" | "missing" | "invalid_request"; ms?: number };
export type RunReport = { session: string; runs: { job: AiJob; status: string; ms: number }[]; stopped: string };
// The model's own reply is kept with the run (inside ai_runs.output.result), so a reply the
// parser could not read can be looked at afterward. It holds only what the model wrote.
export const rawChars = 8000;
// The signal's call may take longer than a live fold but must finish inside its 75 second lease and the trigger's budget.
export const signalTimeoutMs = (config: AiConfig) => Math.min(30000, Math.max(config.timeoutMs, config.deepTimeoutMs));
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function runSession(db: SupabaseClient, ai: AiClient, session: string, config: AiConfig = aiConfig(), deadline = Date.now() + config.budgetMs, tails?: Promise<void>[]): Promise<RunReport> {
  const report: RunReport = { session, runs: [], stopped: "deadline" };
  // The alignment signal's call can take much longer than a live fold, and it has its own lease, so it runs beside the loop: live grouping and
  // folding keep being claimed while it waits for the deeper model. Its tail is awaited by the caller (tails) or here before returning.
  const pending: Promise<void>[] = tails ?? [];
  const finish = async () => { if (!tails) await Promise.all(pending); return report; };
  // One claimed job: the model call, then the apply (or the fail). Returns why the loop should stop, or null.
  const handle = async (claim: Extract<Claim, { status: "claimed" }>, lease: string): Promise<string | null> => {
    const prompt = prompts[claim.job], started = Date.now();
    // The alignment signal compares the room with the themes on the deeper model, with a longer call than a live fold; it names the model it used when it hands the reply back.
    const deep = claim.job === "alignment_signal", used: AiConfig = deep ? { ...config, model: config.deepModel } : config, usedModel = deep ? ai.model(used) : undefined;
    try {
      if (prompt.version !== claim.prompt_version) throw new Error("prompt_version");
      const timeoutMs = Math.max(1000, Math.min(deep ? signalTimeoutMs(config) : config.timeoutMs, deadline - Date.now()));
      const reply = await ai.complete({ system: prompt.system, user: prompt.user(claim.inputs), maxTokens: prompt.maxTokens, timeoutMs }, used);
      const ms = Date.now() - started;
      const { data, error } = await db.rpc("ai_apply", { p_run: claim.run, p_lease: lease, p_output: { ...prompt.parse(reply.text, claim.inputs), raw: reply.text.slice(0, rawChars) },
        p_usage: { input_tokens: reply.inputTokens, output_tokens: reply.outputTokens, cost_usd: costUsd(used, reply.inputTokens, reply.outputTokens), ms, ...(usedModel ? { model: usedModel } : {}) } });
      report.runs.push({ job: claim.job, status: error ? "unavailable" : String(data?.status), ms });
      // An apply that could not commit releases its lease, so the next trigger can try again.
      if (error) { await db.rpc("ai_fail", { p_run: claim.run, p_lease: lease, p_error: "unavailable", p_usage: { ms, ...(usedModel ? { model: usedModel } : {}) } }); return "unavailable"; }
      return null;
    } catch (error) {
      const ms = Date.now() - started, reason = error instanceof Error && /timeout|timed out|abort/i.test(error.message + error.name) ? "timeout" : "unavailable";
      await db.rpc("ai_fail", { p_run: claim.run, p_lease: lease, p_error: reason, p_usage: { ms, ...(usedModel ? { model: usedModel } : {}) } });
      report.runs.push({ job: claim.job, status: reason, ms });
      return "failed";
    }
  };
  for (let i = 0; i < 20 && Date.now() < deadline; i++) {
    const lease = randomUUID(), model = ai.model(config);
    const claimed = await db.rpc("ai_claim", { p_session: session, p_lease: lease, p_model: model, p_versions: promptVersions });
    if (claimed.error) { report.stopped = "unavailable"; return finish(); }
    const claim = claimed.data as Claim;
    // "wait": work is nearly due (the lens summary folds after 3 quiet seconds). Sleep that long, within the budget, and ask again.
    if (claim.status === "wait") {
      const ms = Math.max(100, Math.min(Number(claim.ms) || 500, 4000));
      if (Date.now() + ms >= deadline) { report.stopped = "wait"; return finish(); }
      await sleep(ms); continue;
    }
    if (claim.status !== "claimed") { report.stopped = claim.status; return finish(); }
    if (claim.job === "alignment_signal") { pending.push(handle(claim, lease).then(stop => { if (stop) report.stopped = stop; })); continue; }
    const stop = await handle(claim, lease);
    if (stop) { report.stopped = stop; return finish(); }
  }
  return finish();
}

// One worker per session in this process; a trigger while one runs asks it to go round
// again instead of starting another. Across servers the database lease does the same.
const running = new Map<string, { again: boolean; done: Promise<void> }>();
export function workSessions(db: SupabaseClient, ai: AiClient, sessions: string[], config: AiConfig = aiConfig()) {
  return Promise.all([...new Set(sessions)].map(session => {
    const current = running.get(session);
    if (current) { current.again = true; return current.done; }
    const state = { again: false, done: Promise.resolve() }, tails: Promise<void>[] = [];
    state.done = (async () => {
      const deadline = Date.now() + config.budgetMs;
      try {
        if (config.debounceMs) await sleep(config.debounceMs);
        do { state.again = false; await runSession(db, ai, session, config, deadline, tails); } while (state.again && Date.now() < deadline);
      } catch (error) {
        console.error("AI work unavailable", { code: error instanceof Error ? error.name : "failed" });
      } finally { running.delete(session); }
    })();
    running.set(session, state);
    // The signal's long call outlives the live loop; the caller (the request's after hook) still waits for it.
    return state.done.then(() => Promise.all(tails)).then(() => undefined);
  }));
}

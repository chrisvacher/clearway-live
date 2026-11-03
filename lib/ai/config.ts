// AI configuration (PRD "Models and cost"). Model names and prices live here, read from
// the environment with defaults, never in code paths. Server only: nothing here reaches a
// browser, and the key is read only where the client is made.
export type AiConfig = {
  model: string; // a fast Claude model for live work, where speed matters
  inputPerMtok: number; // US dollars per million input tokens, for the cost log
  outputPerMtok: number;
  timeoutMs: number; // a call slower than this fails and the room carries on in arrival order
  budgetMs: number; // how long one trigger may keep working after the response
  debounceMs: number; // answers arriving together share one call
};

const number = (value: string | undefined, fallback: number, min: number, max: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

export function aiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  return {
    model: /^[a-z0-9][a-z0-9._-]{0,99}$/i.test(env.CLEARWAY_AI_MODEL_LIVE ?? "") ? env.CLEARWAY_AI_MODEL_LIVE! : "claude-haiku-4-5",
    // Defaults are the fast model's list price; set them in Vercel if the price changes.
    inputPerMtok: number(env.CLEARWAY_AI_PRICE_INPUT_PER_MTOK, 1, 0, 1000),
    outputPerMtok: number(env.CLEARWAY_AI_PRICE_OUTPUT_PER_MTOK, 5, 0, 1000),
    timeoutMs: number(env.CLEARWAY_AI_TIMEOUT_MS, 20000, 1000, 60000),
    budgetMs: number(env.CLEARWAY_AI_BUDGET_MS, 40000, 2000, 240000),
    debounceMs: number(env.CLEARWAY_AI_DEBOUNCE_MS, 700, 0, 5000),
  };
}

export function costUsd(config: AiConfig, inputTokens: number, outputTokens: number) {
  return Math.round(((inputTokens * config.inputPerMtok + outputTokens * config.outputPerMtok) / 1e6) * 1e6) / 1e6;
}

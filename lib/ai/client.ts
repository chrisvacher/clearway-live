// The one door to the model. Server only (the AI worker imports it); the Anthropic key
// comes from ANTHROPIC_API_KEY and never leaves the server. Tests and the browser kits
// use the fake client (lib/ai/fake.ts) and never call the API.
import Anthropic from "@anthropic-ai/sdk";
import type { AiConfig } from "./config";
import { fakeClient } from "./fake";

export type AiCall = { system: string; user: string; maxTokens: number; timeoutMs: number };
export type AiReply = { text: string; inputTokens: number; outputTokens: number };
export type AiClient = { model: (config: AiConfig) => string; complete: (call: AiCall, config: AiConfig) => Promise<AiReply> };

export function anthropicClient(key: string): AiClient {
  const api = new Anthropic({ apiKey: key, maxRetries: 0 });
  return {
    model: config => config.model,
    async complete(call, config) {
      const reply = await api.messages.create({ model: config.model, max_tokens: call.maxTokens, temperature: 0, system: call.system,
        messages: [{ role: "user", content: call.user }] }, { timeout: call.timeoutMs });
      const text = reply.content.map(block => block.type === "text" ? block.text : "").join("");
      return { text, inputTokens: reply.usage.input_tokens, outputTokens: reply.usage.output_tokens };
    },
  };
}

// The fake runs only where it is asked for and never on production.
export function aiClient(env: Record<string, string | undefined> = process.env): AiClient | null {
  if (env.CLEARWAY_AI_FAKE && env.VERCEL_ENV !== "production") return fakeClient(env.CLEARWAY_AI_FAKE, env.CLEARWAY_AI_FAKE_CONTROL);
  const key = env.ANTHROPIC_API_KEY;
  return key ? anthropicClient(key) : null;
}

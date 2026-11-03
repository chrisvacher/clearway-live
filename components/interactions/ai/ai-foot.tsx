"use client";
import type { LiveSnapshot } from "@/lib/live/types";
import { combinedLine, type AiWord } from "@/lib/interactions/ai";
import { AiBadge } from "./ai-icon";

// INT-01: once AI has combined anything on the TV, the foot names it once, beside the badge.
export function AiFoot({ frame }: { frame: LiveSnapshot | null }) {
  if (!frame || frame.state.tv_content !== "session" || frame.session?.interaction !== "word_cloud") return null;
  const line = combinedLine(frame.state.results.words as AiWord[]);
  return line ? <span className="ai-line" data-ai-foot><AiBadge />{line}</span> : null;
}

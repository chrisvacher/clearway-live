"use client";
import type { LiveSnapshot } from "@/lib/live/types";
import { combinedLine, type AiWord } from "@/lib/interactions/ai";
import { AiMark, useAiSweep } from "./ai-icon";

// INT-01: once AI has combined anything on the TV, the foot names it once, beside the gradient AI icon.
// Its icon sweeps once with each new combine, with the survivor's own icon in the cloud.
export function AiFoot({ frame }: { frame: LiveSnapshot | null }) {
  const cloud = frame?.state.tv_content === "session" && frame.session?.interaction === "word_cloud";
  const words = cloud ? frame!.state.results.words as AiWord[] : [];
  const ref = useAiSweep<HTMLSpanElement>(words.flatMap(w => (w.merged ?? []).map(key => `${w.key}\u0001${key}`)), cloud ? frame!.session!.id : null);
  const line = cloud ? combinedLine(words) : "";
  return line ? <span ref={ref} className="ai-line" data-ai-foot><AiMark />{line}</span> : null;
}

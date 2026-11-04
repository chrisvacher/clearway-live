"use client";
import { useEffect, useRef } from "react";
import { aiIconPath } from "./ai-path";
import { AiChanges, sweepAi } from "./ai-dom";
import "./ai.css";

// AI has one icon everywhere (design pass 3, change 14), in two forms ("gradient ink with a sweep",
// Chris, November 3: no badge tile anywhere):
//  * AiIcon: the plain icon in currentColor, inside buttons, on coloured fills and in the summary's header band.
//  * AiMark: the icon itself in the AI gradient, chosen by its ground (ai.css), with what AI did beside it in plain words.
export function AiIcon({ size }: { size?: number }) {
  return <svg className="cwl-ai-icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false"><path fill="currentColor" fillRule="evenodd" d={aiIconPath} /></svg>;
}
export function AiMark({ label = "AI" }: { label?: string }) {
  return <span className="cwl-ai-mark" role="img" aria-label={label} />;
}

// The sweep for React-built marks: put the ref on the element that holds the mark. `keys` names what
// AI has done there (AiChanges, ai-dom.ts); the marks inside sweep once when a key appears that this
// element has never seen. A new scope (another session or question) starts again without a sweep.
export function useAiSweep<T extends Element>(keys: readonly string[], scope?: string | null) {
  const ref = useRef<T>(null), changes = useRef<{ scope: string | null | undefined; ai: AiChanges } | null>(null);
  const sign = [...keys].sort().join("\u0001");
  useEffect(() => {
    if (!changes.current || changes.current.scope !== scope) changes.current = { scope, ai: new AiChanges() };
    if (changes.current.ai.next(sign ? sign.split("\u0001") : []).length) sweepAi(ref.current);
  }, [sign, scope]);
  return ref;
}

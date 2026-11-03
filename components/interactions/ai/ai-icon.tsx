"use client";
import { useId } from "react";
import { aiIconPath } from "./ai-path";
import "./ai.css";

// AI has one icon everywhere (design pass 3, change 14), in three forms:
//  * AiIcon: the plain icon in currentColor, inside buttons and the summary's header band.
//  * AiBadge: the Navy icon on the AI gradient, with what AI did beside it in plain words.
//  * AiGlyph: the icon filled with the gradient, for a mark on an item (a combined word).
export function AiIcon({ size }: { size?: number }) {
  return <svg className="cwl-ai-icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false"><path fill="currentColor" fillRule="evenodd" d={aiIconPath} /></svg>;
}
export function AiBadge({ label = "AI" }: { label?: string }) {
  return <span className="cwl-ai-badge" role="img" aria-label={label}><AiIcon /></span>;
}
export function AiGlyph() {
  const id = `cwl-ai-g${useId().replace(/[^a-z0-9]/gi, "")}`;
  return <span className="cwl-ai-glyph" role="img" aria-label="AI"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <defs><linearGradient id={id} gradientUnits="userSpaceOnUse" x1="3" y1="2" x2="21" y2="22"><stop offset="0" className="cwl-ai-stop-start" /><stop offset="1" className="cwl-ai-stop-end" /></linearGradient></defs>
    <g fill={`url(#${id})`}><path fillRule="evenodd" d={aiIconPath} /></g></svg></span>;
}

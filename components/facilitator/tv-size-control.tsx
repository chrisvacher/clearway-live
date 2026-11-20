"use client";

import type { KeyboardEvent } from "react";
import type { TvAppearance } from "@/lib/tv/types";

export const tvTypeSizes = [
  ["very_large", "Smallest"],
  ["large", "Smaller"],
  ["medium", "Medium"],
  ["small", "Larger"],
  ["very_small", "Largest"],
] as const;

export function TvSizeControl({ value, onChange, disabled = false, label = "Type size on the TV" }: {
  value: TvAppearance["room_size"];
  onChange: (value: TvAppearance["room_size"]) => void;
  disabled?: boolean;
  label?: string;
}) {
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + tvTypeSizes.length) % tvTypeSizes.length;
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button");
    buttons?.[next]?.focus();
    onChange(tvTypeSizes[next][0]);
  }

  return <div className="cwl-c-tv-sizes" role="radiogroup" aria-label={label}>
    {tvTypeSizes.map(([size, name], index) => <button key={size} type="button" role="radio"
      aria-checked={value === size} disabled={disabled} tabIndex={value === size ? 0 : -1}
      onKeyDown={event => keyboard(event, index)} onClick={() => { if (size !== value) onChange(size); }}>{name}</button>)}
  </div>;
}

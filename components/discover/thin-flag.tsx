import { CircleDashed, Check } from "lucide-react";

// ThinFlag (design pass 6): a dashed outline, the circle-dashed icon and the words Thin data, with the reason.
// It reads without color. The rule is code (lib/discover/thin.ts), never AI.
export function ThinFlag({ reason }: { reason: string }) {
  return <span className="dsc-thin" role="note"><CircleDashed aria-hidden="true" /><b>Thin data</b>{reason ? <span>{reason}</span> : null}</span>;
}

export function StrongMark() {
  return <span className="dsc-strong"><Check aria-hidden="true" />Strong</span>;
}

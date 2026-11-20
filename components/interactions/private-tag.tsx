import { Lock } from "lucide-react";
import { isPrivateStep } from "@/lib/interactions/visibility";
import type { InteractionKind } from "@/lib/interactions/kinds";

// The small Private tag on a step whose answers only the facilitators see (Who sees answers: Facilitators only).
// Compact (the control surface's narrow run list) shows the lock alone, named Private for screen readers.
export function PrivateTag({ step, compact = false, className = "" }: { step: { interaction: InteractionKind; options?: Record<string, unknown> | null } | null | undefined; compact?: boolean; className?: string }) {
  if (!isPrivateStep(step)) return null;
  return <span className={`cwl-private-tag${compact ? " is-compact" : ""} ${className}`.trim()} data-private-tag title="Private: only the facilitators see the answers">
    <Lock aria-hidden="true" />{compact ? <span className="sr-only">Private</span> : "Private"}</span>;
}

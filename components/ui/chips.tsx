import { Check, ChevronDown, CircleCheck, Eye, PencilLine, Radio } from "lucide-react";
import type { ReactNode } from "react";
import { stageLabels, stagesFor, type Stage, type StageChoice } from "@/lib/setup/stage";
import { Menu } from "./menu";

type Tone = "neutral" | "success" | "warning" | "error" | "info" | "live" | "selected" | "stage-info";
type ChipProps = { compact?: boolean; tone?: Tone; children: ReactNode; icon?: ReactNode };

export function StatusChip({ children, icon, tone = "neutral", compact }: ChipProps) {
  return <span className={`cwl-ui-chip cwl-ui-chip--${tone}${compact ? " is-compact" : ""}`}>
    {icon ?? <span className="cwl-ui-chip-dot" aria-hidden="true" />}{children}
  </span>;
}

const stageTones: Record<Stage, Tone> = {
  setup: "neutral", ready: "success", live: "live", done: "selected", discover: "stage-info",
  pre_call: "stage-info", retreat: "live", follow_up: "stage-info", closed: "selected",
};

export function StageChip({ stage, type, interactive, onStageChange, compact }: {
  stage: Stage;
  type?: string;
  interactive?: boolean;
  onStageChange?: (selection: StageChoice) => void;
  compact?: boolean;
}) {
  const label = stageLabels[stage];
  const chip = <StatusChip tone={stageTones[stage]} compact={compact}>{label}
    {interactive && <ChevronDown className="cwl-ui-chip-chevron" aria-hidden="true" />}
  </StatusChip>;
  if (!interactive || !type || !onStageChange) return chip;
  const choices = stagesFor(type)
    .filter(choice => type !== "team_workshop" || (stage === "done" ? choice.stage === "setup" : choice.stage === "done"));
  return <Menu className="cwl-ui-chip-menu" label={`Change stage, currently ${label}`} trigger={chip}
    items={choices.map(choice => ({
      label: choice.label,
      danger: choice.stage === "done",
      disabled: choice.stage === stage,
      onSelect: () => onStageChange(choice),
    }))} />;
}

const stepChips = {
  draft: { label: "Draft", tone: "neutral", icon: PencilLine },
  ready: { label: "Ready", tone: "success", icon: CircleCheck },
  preview: { label: "Preview", tone: "info", icon: Eye },
  live: { label: "Live", tone: "live", icon: Radio },
  done: { label: "Done", tone: "neutral", icon: Check },
} satisfies Record<string, { label: string; tone: Tone; icon: typeof Check }>;

export function StepChip({ state, compact }: { state: keyof typeof stepChips; compact?: boolean }) {
  const { icon: Icon, label, tone } = stepChips[state];
  return <StatusChip tone={tone} compact={compact} icon={<Icon aria-hidden="true" />}>{label}</StatusChip>;
}

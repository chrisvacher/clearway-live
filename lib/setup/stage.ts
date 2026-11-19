export type Stage = "setup" | "ready" | "live" | "done" | "discover" | "pre_call" | "retreat" | "follow_up" | "closed";
export type StageStatus = Exclude<Stage, "ready" | "live" | "done">;
export type StageChoice = { stage: Stage; label: string; status: StageStatus };

export const stageLabels: Record<Stage, string> = {
  setup: "Setup",
  ready: "Ready",
  live: "Live",
  done: "Done",
  discover: "Discover",
  pre_call: "Pre-call",
  retreat: "Retreat",
  follow_up: "Follow-up",
  closed: "Closed",
};

const retreatStages: StageStatus[] = ["setup", "discover", "pre_call", "retreat", "follow_up", "closed"];

export function stageFor(
  engagement: { type: string; status: string },
  readiness: readonly { state: "ready" | "todo" | "optional" }[],
  roomState?: { live_session_id?: string | null } | null,
): Stage {
  if (engagement.type === "team_workshop") {
    if (engagement.status === "closed") return "done";
    if (roomState?.live_session_id) return "live";
    return readiness.some(item => item.state === "todo") ? "setup" : "ready";
  }

  return retreatStages.find(stage => stage === engagement.status) ?? "setup";
}

export function stagesFor(type: string): StageChoice[] {
  if (type === "team_workshop") {
    return [
      { stage: "done", label: "Mark as done", status: "closed" },
      { stage: "setup", label: "Reopen", status: "setup" },
    ];
  }

  return retreatStages.map(status => ({ stage: status, label: stageLabels[status], status }));
}

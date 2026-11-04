import { BadgeCheck, Check, Loader, Pencil, TriangleAlert } from "lucide-react";
import type { Draft } from "./types";
import { rowStatus } from "@/lib/overnight/policy";

export function StatusChip({ draft }: { draft: Draft }) {
  const { kind, label } = rowStatus(draft);
  const icon = kind === "reviewed" ? <BadgeCheck aria-hidden="true" /> : kind === "drafting" ? <Loader aria-hidden="true" /> : kind === "editing" ? <Pencil aria-hidden="true" />
    : kind === "flag" ? <span className="d"><TriangleAlert aria-hidden="true" /></span> : <Check aria-hidden="true" />;
  return <span className={`ovr-st is-${kind === "by_hand" ? "ready" : kind}`}>{icon}{label}</span>;
}

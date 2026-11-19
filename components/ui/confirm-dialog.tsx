"use client";

import { TriangleAlert } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Button } from "./button";
import { Dialog } from "./dialog";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
};

export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel = "Cancel", onCancel, onConfirm, busy }: ConfirmDialogProps) {
  const id = useId();
  function close() {
    if (!busy) onCancel();
  }
  return <Dialog open={open} onClose={close} className="cwl-ui-confirm" labelledBy={`${id}-title`} describedBy={`${id}-description`}>
    <h2 id={`${id}-title`}><TriangleAlert size={20} aria-hidden="true" />{title}</h2>
    <div className="cwl-ui-confirm-description" id={`${id}-description`}>{description}</div>
    <footer>
      <Button onClick={close} data-initial-focus disabled={busy}>{cancelLabel}</Button>
      <Button variant="danger-solid" onClick={onConfirm} disabled={busy}>{confirmLabel}</Button>
    </footer>
  </Dialog>;
}

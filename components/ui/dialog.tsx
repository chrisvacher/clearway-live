"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

export function Dialog({ open, onClose, label, labelledBy, describedBy, className, children }: {
  open: boolean;
  onClose: () => void;
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  className?: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element || !open) return;
    const formerFocus = document.activeElement;
    element.showModal();
    element.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    return () => {
      element.close();
      if (formerFocus instanceof HTMLElement && formerFocus.isConnected) formerFocus.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return <dialog ref={dialog} aria-label={label} aria-labelledby={labelledBy} aria-describedby={describedBy}
    className={`cwl-ui-dialog ${className ?? ""}`}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    {children}
  </dialog>;
}

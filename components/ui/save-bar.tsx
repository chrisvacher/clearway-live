"use client";

import { PencilLine } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./button";
import { ConfirmDialog, type ConfirmDialogProps } from "./confirm-dialog";

export function SaveBar({ dirtyFields, labels, onDiscard, onSave, error, saving, confirmation }: {
  dirtyFields: readonly string[];
  labels?: Readonly<Record<string, string>>;
  onDiscard: () => void;
  onSave: () => unknown;
  error?: string | null;
  saving?: boolean;
  confirmation?: ConfirmDialogProps;
}) {
  const count = dirtyFields.length;
  const label = count === 1 ? labels?.[dirtyFields[0]] ?? dirtyFields[0] : undefined;
  const message = error ?? (count === 1 ? `1 unsaved change: ${label}` : `${count} unsaved changes`);
  const [previous, setPrevious] = useState<string | null>(null);

  useEffect(() => {
    if (count) setPrevious(message);
  }, [count, message]);

  useEffect(() => {
    if (!count) return;
    function shortcut(event: KeyboardEvent) {
      if ((!event.ctrlKey && !event.metaKey) || event.key.toLowerCase() !== "s" || event.altKey) return;
      event.preventDefault();
      if (!saving && !confirmation?.open) onSave();
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [count, onSave, saving, confirmation?.open]);

  if (!count && !previous) return null;

  return <>
    <div className={`cwl-ui-savebar${!count ? " is-leaving" : ""}`} aria-hidden={!count || undefined}
      onAnimationEnd={() => { if (!count) setPrevious(null); }}>
      <div role={error ? "alert" : "status"} className="cwl-ui-savebar-message"><PencilLine size={16} aria-hidden="true" />{count ? message : previous}</div>
      <div className="cwl-ui-savebar-actions">
        <Button onClick={onDiscard} disabled={saving || !count}>Discard</Button>
        <Button variant="primary" onClick={onSave} disabled={saving || !count} aria-keyshortcuts="Control+S Meta+S">
          {saving ? "Saving" : "Save changes"}<kbd aria-hidden="true">⌘S</kbd>
        </Button>
      </div>
    </div>
    {confirmation && <ConfirmDialog {...confirmation} />}
  </>;
}

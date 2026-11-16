"use client";
import { useState } from "react";
import { AppWindow } from "lucide-react";
import { blockedPopupLine, openTvWindow } from "@/lib/tv/pair-link";

const said = (status: string) => status === "closed" ? "This engagement has closed." : status === "limited" ? "Please wait a few minutes before opening another window." : "We couldn't open the TV. Please try again.";
export type TvNote = { text: string; error: boolean; url?: string };

// One click opens the TV as its own window on this laptop and pairs it. Pressing it again reuses the same window (cwl-tv),
// so it also mends a TV that dropped or was unpaired when the workshop ended. The live room's TV chip and its header
// button both run this.
export function useOpenTv(id: string) {
  const [busy, setBusy] = useState(false), [note, setNote] = useState<TvNote | null>(null);
  async function open() {
    setBusy(true); setNote(null);
    let failure = "";
    const result = await openTvWindow(window, async () => {
      try {
        const response = await fetch(`/api/tv/control/${id}/window`, { method: "POST", cache: "no-store" });
        const data = await response.json() as { status: string; url?: string };
        if (response.ok && data.status === "ok" && data.url) return data.url;
        failure = data.status;
      } catch { failure = "unavailable"; }
      return null;
    });
    if (result.how === "failed") setNote({ text: said(failure), error: true });
    else if (result.how === "tab") setNote({ text: blockedPopupLine, error: false });
    else if (result.how === "link") setNote({ text: blockedPopupLine, error: false, url: result.url });
    setBusy(false);
  }
  return { open, busy, note };
}

export function TvNoteLine({ note }: { note: TvNote | null }) {
  if (!note) return null;
  return <p className={`admin-saved${note.error ? " is-error" : ""}`} role={note.error ? "alert" : "status"}>{note.text}{note.url && <> <a href={note.url} target="_blank" rel="noreferrer">Open the TV</a></>}</p>;
}

// `variant` is the button's size: the card action on Overview and Screens, the same 44px standard as its neighbours on the
// control surface.
export function OpenTvWindow({ id, variant = "card", primary = false, disabled = false }: { id: string; variant?: "card" | "small"; primary?: boolean; disabled?: boolean }) {
  const { open, busy, note } = useOpenTv(id);
  return <>
    <button type="button" className={variant === "small" ? "show-button" : `admin-button${primary ? " is-primary" : ""}`} disabled={busy || disabled} onClick={() => void open()}><AppWindow size={16} aria-hidden="true" />Open the TV in a new window</button>
    <TvNoteLine note={note} />
  </>;
}

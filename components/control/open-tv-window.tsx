"use client";
import { useState } from "react";
import { AppWindow } from "lucide-react";
import { blockedPopupLine, openTvWindow } from "@/lib/tv/pair-link";

const said = (status: string) => status === "closed" ? "This engagement has closed." : status === "limited" ? "Please wait a few minutes before opening another window." : "We couldn't open the TV. Please try again.";
// One click opens the TV as its own window on this laptop and pairs it. `variant` is the button's size: the card action on
// Overview and Screens, the small one on the control surface.
export function OpenTvWindow({ id, variant = "card", primary = false, disabled = false }: { id: string; variant?: "card" | "small"; primary?: boolean; disabled?: boolean }) {
  const [busy, setBusy] = useState(false), [note, setNote] = useState<{ text: string; error: boolean; url?: string } | null>(null);
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
  return <>
    <button type="button" className={variant === "small" ? "show-button is-small" : `admin-button${primary ? " is-primary" : ""}`} disabled={busy || disabled} onClick={() => void open()}><AppWindow size={16} aria-hidden="true" />Open the TV in a new window</button>
    {note && <p className={`admin-saved${note.error ? " is-error" : ""}`} role={note.error ? "alert" : "status"}>{note.text}{note.url && <> <a href={note.url} target="_blank" rel="noreferrer">Open the TV</a></>}</p>}
  </>;
}

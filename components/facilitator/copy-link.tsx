"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyLink({ link, label }: { link: string; label: string }) {
  const [done, setDone] = useState(false);
  return <button className="admin-button" type="button" aria-label={done ? "Link copied" : label} onClick={async () => { try { await navigator.clipboard.writeText(`https://${link}`); setDone(true); } catch { setDone(false); } }}>
    {done ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}</button>;
}

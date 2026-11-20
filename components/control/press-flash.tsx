"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

export function GoLiveTile() {
  return <span className="ctl-golive-tile" aria-hidden="true"><Send size={18} /></span>;
}

export function usePressFlash() {
  const [flashing, setFlashing] = useState(false);
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (reset.current !== null) clearTimeout(reset.current); }, []);
  function flash(after?: () => void) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { after?.(); return; }
    if (reset.current !== null) clearTimeout(reset.current);
    setFlashing(true);
    reset.current = setTimeout(() => { setFlashing(false); after?.(); }, 600);
  }
  return { flashing, flash };
}

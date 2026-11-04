"use client";
import { useEffect, useState } from "react";
import { ScribeConsole } from "./scribe-console";
import { EaselCapture } from "./easel-capture";
import { useScribe } from "./use-scribe";

// What the room page shows a signed-in scribe: the console on a laptop, the easel camera on a phone.
export function ScribeRoom({ engagement, church }: { engagement: string; church: string }) {
  const scribe = useScribe(engagement);
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 900px)");
    const update = () => setWide(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  if (wide === null) return <p role="status">Opening the scribe console</p>;
  return <div data-surface="scribe" data-theme="light" className="scr-root">{wide ? <ScribeConsole engagement={engagement} church={church} scribe={scribe} /> : <EaselCapture engagement={engagement} church={church} scribe={scribe} />}</div>;
}

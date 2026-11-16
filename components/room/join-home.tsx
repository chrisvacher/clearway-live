"use client";
import { useEffect, useState } from "react";
import { PhoneLoop } from "./phone-content";
import "@/components/tv/images.css";

type Home = { images: string[]; seconds: number; transition: string; started_at: string | null };
// A phone that hasn't joined yet shows the Home loop above the join form while Home is on the TV (LP-1). It asks again every
// 15 seconds, so the image goes when the facilitator moves on. The image's place comes from the server's clock.
export function JoinHome({ engagement }: { engagement: string }) {
  const [home, setHome] = useState<Home | null>(null), [offset, setOffset] = useState(0);
  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const sent = Date.now(), response = await fetch(`/api/room/${engagement}/home`, { cache: "no-store" });
        const data = await response.json() as { status?: string; home?: Home | null; server_time?: string };
        if (!stopped && response.ok && data.status === "ok") {
          setHome(data.home ?? null);
          if (data.server_time) setOffset(Date.parse(data.server_time) - (sent + Date.now()) / 2);
        }
      } catch { /* Keep what's showing. */ }
      finally { if (!stopped) timer = setTimeout(() => void poll(), 15000); }
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [engagement]);
  if (!home || !home.images.length) return null;
  // PhoneLoop reads the room clock; before this phone has joined, that clock is this page's own, so shift the start time.
  const started = home.started_at ? new Date(Date.parse(home.started_at) - offset).toISOString() : null;
  return <div className="join-home"><PhoneLoop engagement={engagement} images={home.images} seconds={home.seconds} startedAt={started} join /></div>;
}

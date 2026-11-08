"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";

// The "After the retreat" link in the control surface's header. It asks the report's light status call whether the report is here (the database may not have it
// yet) and shows nothing until it is, so a missing report never puts an error on the room's control surface.
export function AfterLink({ engagement }: { engagement: string }) {
  const [here, setHere] = useState(false);
  useEffect(() => {
    let stop = false;
    void fetch(`/api/control/${engagement}/report?probe=1`, { cache: "no-store" }).then(r => r.json()).then((d: { status?: string }) => { if (!stop) setHere(d.status === "ok"); }).catch(() => {});
    return () => { stop = true; };
  }, [engagement]);
  return here ? <Link className="show-button" href={`/control/${engagement}/after`} data-testid="after-link"><CalendarDays size={18} aria-hidden="true" />After the retreat</Link> : null;
}

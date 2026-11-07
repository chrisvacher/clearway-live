"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

// The "After the retreat" link on the control surface. It asks the report whether it is here (the database may not have it yet) and shows nothing
// until it is, so a missing report never puts an error on the room's control surface.
export function AfterLink({ engagement, children }: { engagement: string; children: (link: React.ReactNode) => React.ReactNode }) {
  const [here, setHere] = useState(false);
  useEffect(() => {
    let stop = false;
    void fetch(`/api/control/${engagement}/report?probe=1`, { cache: "no-store" }).then(r => r.json()).then((d: { status?: string }) => { if (!stop) setHere(d.status === "ok"); }).catch(() => {});
    return () => { stop = true; };
  }, [engagement]);
  return here ? <>{children(<Link className="show-button is-small" href={`/control/${engagement}/after`} data-testid="after-link">After the retreat</Link>)}</> : null;
}

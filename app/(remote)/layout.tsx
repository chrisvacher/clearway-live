import type { ReactNode } from "react";

// The remote is part of the control surface: facilitator-only, light, phone-sized.
export default function RemoteLayout({ children }: { children: ReactNode }) {
  return <div className="surface ctl-remote-surface" data-surface="control" data-theme="light">{children}</div>;
}

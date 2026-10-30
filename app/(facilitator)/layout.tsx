import type { ReactNode } from "react";
import { Surface } from "@/components/layout/surface";

// Public signed-out shell only. Protected setup pages arrive with facilitator auth.
export default function FacilitatorLayout({ children }: { children: ReactNode }) {
  return <Surface surface="control" theme="light">{children}</Surface>;
}

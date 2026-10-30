import type { ReactNode } from "react";
import { Surface } from "@/components/layout/surface";

// Shared control appearance. The protected route group enforces facilitator access.
export default function FacilitatorLayout({ children }: { children: ReactNode }) {
  return <Surface surface="control" theme="light">{children}</Surface>;
}

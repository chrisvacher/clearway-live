import type { ReactNode } from "react";
import { Surface } from "@/components/layout/surface";

// Phone-only tree. It imports no facilitator UI, providers or integrations.
export default function RoomLayout({ children }: { children: ReactNode }) {
  return <Surface surface="phone" theme="dark">{children}</Surface>;
}

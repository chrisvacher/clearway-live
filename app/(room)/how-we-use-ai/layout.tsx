import type { ReactNode } from "react";
import { Surface } from "@/components/layout/surface";
import { addressSkin } from "@/lib/brand/request";

// "How we use AI" is not tied to one engagement, so the address decides its skin.
export default async function HowWeUseAiLayout({ children }: { children: ReactNode }) {
  return <Surface surface="phone" theme="dark" skin={await addressSkin()}>{children}</Surface>;
}

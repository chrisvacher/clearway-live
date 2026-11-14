import type { ReactNode } from "react";

// Phone-only tree. It imports no facilitator UI, providers or integrations. Each page group below draws its own Surface, because the
// skin comes from the engagement where one is known (room/[id]) and from the address where it isn't. The tab title and icon follow the
// address from the root layout, and the engagement's own layout names its tab for the engagement's skin.
export default function RoomLayout({ children }: { children: ReactNode }) { return children; }

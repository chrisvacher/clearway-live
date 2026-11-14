import type { ReactNode } from "react";
import { Surface } from "@/components/layout/surface";
import { roomSkin } from "@/lib/brand/request";
import { screenPage } from "@/lib/brand/metadata";
import { roomInfoOnce } from "@/lib/room/info";

// An engagement's phone pages (room and sign-in confirmation): the engagement's skin decides, wherever the phone opened them, so a
// phone signed in at live.novetera.co keeps working there and takes the Clearway look if the engagement is switched back to Clearway.
const skinOfRoom = async (params: Promise<{ id: string }>) => roomSkin((await roomInfoOnce((await params).id))?.skin);
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) { return screenPage(await skinOfRoom(params)); }
export default async function EngagementLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  return <Surface surface="phone" theme="dark" skin={await skinOfRoom(params)}>{children}</Surface>;
}

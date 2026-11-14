import "server-only";
import { headers } from "next/headers";
import { skinForHost, skinOf, type Skin } from "./brands";

// Which skin the address asks for, read from the request's Host header (never from env on the client). Before an engagement is
// known, this decides; once it is known, the engagement's own skin beats it (see roomSkin). An address that is neither (a preview
// deployment, localhost) is Clearway.
export async function addressSkin(): Promise<Skin> {
  return skinForHost((await headers()).get("host")) ?? "clearway";
}
// The engagement's skin once it is known (from room_public_info or the live snapshot), else the address's.
export async function roomSkin(engagementSkin: unknown): Promise<Skin> {
  return engagementSkin === "novetera" || engagementSkin === "clearway" ? skinOf(engagementSkin) : addressSkin();
}

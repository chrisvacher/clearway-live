import { cache } from "react";
import { roomInfo } from "./server";

// room_public_info for one engagement, asked once per request: the engagement layout reads its skin and the page reads the rest.
// An unreachable or missing engagement is null (the page fails closed to not-found; the layout falls back to the address's skin).
export const roomInfoOnce = cache(async (id: string) => { try { return await roomInfo(id); } catch { return null; } });

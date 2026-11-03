import "server-only";
import { serviceClient } from "@/lib/server/supabase";
import { uuid } from "@/lib/room/policy";

// Whether the room sign-in shows the AI line: the engagement has AI on. If the database
// can't answer, the room page can't sign anyone in either, so the line stays off.
export async function roomAi(engagement: string) {
  if (!uuid(engagement)) return false;
  const { data, error } = await serviceClient().rpc("room_ai", { p_engagement: engagement });
  if (error) { console.error("Room AI setting unavailable", { code: error.code }); return false; }
  return data === true;
}

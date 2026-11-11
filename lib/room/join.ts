import { serviceClient } from "@/lib/server/supabase";
import { practiceCode, roomCode, typedRoomCode } from "@/lib/tv/policy";

// live.clearway.co/CODE and the front page's join box share one rule. A known code opens
// its room (which still asks for the person's email, checked against the attendee list).
// Anything else returns to the join box with a quiet note. The engagement's id never
// appears unless the code is right.
export type JoinTarget = { path: string; found: boolean };

// The practice room, by name.
const practice = (code: string) => code === practiceCode;
// A path segment counts as a room link only when it is shaped like one, so a mistyped
// page (live.clearway.co/remote) gets the app's not-found page instead of the join box.
export const codeShaped = (segment: string) => { const code = typedRoomCode(segment); return roomCode(code) || practice(code); };
// A link name a facilitator chose (live.clearway.co/hopeoakville): 3 to 24 letters or digits.
export const nameShaped = (segment: string) => /^[a-z0-9]{3,24}$/i.test(segment.trim()) && !roomCode(segment.trim());

export async function joinTarget(raw: unknown): Promise<JoinTarget> {
  const code = typedRoomCode(raw);
  const back = (status: string): JoinTarget => {
    const query = new URLSearchParams(code ? { code, status } : { status });
    return { path: `/?${query}#join`, found: false };
  };
  if (!code) return back("empty");
  if (practice(code)) return { path: "/practice", found: true };
  if (!roomCode(code) && !nameShaped(code)) return back("unknown");
  try {
    const { data, error } = await serviceClient().rpc("tv_room_link", { p_code: code });
    if (error) return back("unavailable");
    return data ? { path: `/room/${data}`, found: true } : back("unknown");
  } catch { return back("unavailable"); }
}

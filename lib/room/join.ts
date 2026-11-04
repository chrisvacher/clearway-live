import { NextResponse, type NextRequest } from "next/server";
import { serviceClient } from "@/lib/server/supabase";
import { privateResponse } from "@/lib/auth/response";
import { practiceCode, roomCode, typedRoomCode } from "@/lib/tv/policy";
import { demoDisplay } from "@/lib/public/demo-room";

// live.clearway.co/CODE and the join box on the front page. A known code opens its
// room (which still asks for the person's email, checked against the attendee list).
// Anything else returns to the join box with a quiet note. The engagement's id never
// appears unless the code is right.
export async function joinByCode(request: NextRequest, raw: unknown) {
  const code = typedRoomCode(raw);
  const back = (status: string) => {
    const url = new URL("/", request.url);
    if (code) url.searchParams.set("code", code);
    url.searchParams.set("status", status);
    url.hash = "join";
    return privateResponse(NextResponse.redirect(url, 303));
  };
  if (!code) return back("empty");
  // The front page's demo join screen shows a code too, and it opens the practice room.
  if (code === practiceCode || code === demoDisplay.room_code) return privateResponse(NextResponse.redirect(new URL("/practice", request.url), 307));
  if (!roomCode(code)) return back("unknown");
  try {
    const { data, error } = await serviceClient().rpc("tv_room_link", { p_code: code });
    if (error) return back("unavailable");
    return data ? privateResponse(NextResponse.redirect(new URL(`/room/${data}`, request.url), 307)) : back("unknown");
  } catch { return back("unavailable"); }
}

import { NextResponse, type NextRequest } from "next/server";
import { serviceClient } from "@/lib/server/supabase";
import { privateResponse } from "@/lib/auth/response";
import { roomCode } from "@/lib/tv/policy";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!roomCode(code)) return privateResponse(NextResponse.redirect(new URL("/room", request.url), 307));
  try {
    const { data, error } = await serviceClient().rpc("tv_room_link", { p_code: code.toUpperCase() });
    if (error) return privateResponse(NextResponse.json({ status: "unavailable" }, { status: 503 }));
    return privateResponse(NextResponse.redirect(new URL(data ? `/room/${data}` : "/room", request.url), 307));
  } catch { return privateResponse(NextResponse.json({ status: "unavailable" }, { status: 503 })); }
}

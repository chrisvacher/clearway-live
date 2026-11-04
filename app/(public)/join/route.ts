import { NextResponse, type NextRequest } from "next/server";
import { privateResponse } from "@/lib/auth/response";
import { joinTarget } from "@/lib/room/join";
export const dynamic = "force-dynamic";

// The front page's join box sends here, so joining works before any script loads.
export async function GET(request: NextRequest) {
  const target = await joinTarget(request.nextUrl.searchParams.get("code"));
  return privateResponse(NextResponse.redirect(new URL(target.path, request.url), target.found ? 307 : 303));
}

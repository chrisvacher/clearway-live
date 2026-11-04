import type { NextRequest } from "next/server";
import { joinByCode } from "@/lib/room/join";
export const dynamic = "force-dynamic";

// The front page's join box posts here, so joining works before any script loads.
export async function GET(request: NextRequest) {
  return joinByCode(request, request.nextUrl.searchParams.get("code"));
}

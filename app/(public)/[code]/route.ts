import { NextResponse, type NextRequest } from "next/server";
import { joinByCode } from "@/lib/room/join";
export const dynamic = "force-dynamic";

// live.clearway.co/CODE: the room link the TV shows and its QR code opens.
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  // Files (favicon.ico and the like) are not room codes.
  if (code.includes(".")) return new NextResponse(null, { status: 404 });
  return joinByCode(request, code);
}

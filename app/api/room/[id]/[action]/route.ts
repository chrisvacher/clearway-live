import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleRoom } from "@/lib/room/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  return action === "status" ? handleRoom(request, id, action) : new NextResponse(null, { status: 405 });
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  if (!["init", "send", "verify", "confirm", "join", "claim"].includes(action)) return new NextResponse(null, { status: 404 });
  return handleRoom(request, id, action);
}

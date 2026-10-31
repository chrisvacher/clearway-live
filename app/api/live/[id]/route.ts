import type { NextRequest } from "next/server";
import { handleLive } from "@/lib/live/server";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleLive(request, (await params).id);
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleLive(request, (await params).id);
}

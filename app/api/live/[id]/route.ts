import type { NextRequest } from "next/server";
import { handleLive } from "@/lib/live/server";

export const dynamic = "force-dynamic";
// AI work runs after the response (lib/ai/trigger.ts) and may take a while; the answer never waits for it.
export const maxDuration = 60;
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleLive(request, (await params).id);
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleLive(request, (await params).id);
}

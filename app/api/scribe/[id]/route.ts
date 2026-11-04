import type { NextRequest } from "next/server";
import { readScribeState, scribeRoute, writeScribe } from "@/lib/scribe/server";

export const dynamic = "force-dynamic";
// The scribe console and the control surface's feed read the same state. The scribe's calls are
// capture, edit, re-file and the two steps of a file upload (SCR-01, SCR-02, FAIL-03).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return scribeRoute(request, id, client => readScribeState(client, id));
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return scribeRoute(request, id, (client, _surface, body) => body ? writeScribe(client, id, body) : Promise.resolve({ data: { status: "invalid_request" }, status: 422 }));
}

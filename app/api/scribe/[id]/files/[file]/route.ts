import type { NextRequest } from "next/server";
import { fileResponse } from "@/lib/scribe/server";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await params;
  return fileResponse(request, id, file);
}

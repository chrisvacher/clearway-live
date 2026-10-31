import type { NextRequest } from "next/server";
import { syncTv } from "@/lib/tv/server";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) { return syncTv(request); }

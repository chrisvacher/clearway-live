import { type NextRequest, NextResponse } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { uuid } from "@/lib/room/identity";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, facilitator = await getFacilitator();
  if (!uuid(id) || !facilitator?.profile.is_admin) return new NextResponse(null, { status: 403 });
  const first = await facilitator.client.rpc("ops_backup_chunk", { p_backup: id, p_part: 0 });
  if (first.error || first.data?.status !== "ok" || !first.data.data) return new NextResponse(null, { status: 404 });
  let stopped = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(Buffer.from(first.data.data, "base64"));
        for (let part = 1; part < first.data.parts && !stopped; part++) {
          const next = await facilitator.client.rpc("ops_backup_chunk", { p_backup: id, p_part: part });
          if (next.error || next.data?.status !== "ok" || !next.data.data) throw new Error("Copy unavailable");
          if (!stopped) controller.enqueue(Buffer.from(next.data.data, "base64"));
        }
        if (!stopped) controller.close();
      } catch { if (!stopped) controller.error(new Error("Copy unavailable")); }
    },
    cancel() { stopped = true; },
  });
  return new NextResponse(stream, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "Content-Type": "application/octet-stream", "X-Content-SHA256": first.data.sha256,
    "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(first.data.name) } });
}

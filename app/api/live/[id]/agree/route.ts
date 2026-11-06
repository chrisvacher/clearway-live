import type { NextRequest } from "next/server";
import { phoneQa } from "@/lib/interactions/qa-server";
import { roomMutation } from "@/lib/live/mutation";
import { agreeBody } from "@/lib/interactions/four-lists";

export const dynamic = "force-dynamic";
// One tap: agree or take it back. A state, not a toggle, so a resend never flips it twice. Not on your own card.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return phoneQa(request, id, async (client, body) => {
    const input = agreeBody(body);
    if (!input) return { data: { status: "invalid_request" }, status: 422 };
    const { data, error } = await roomMutation(client, id, () => client.rpc("four_lists_agree", { p_engagement: id, p_card: input.card, p_on: input.on }));
    if (error) throw error;
    const status = data.status as string;
    return { data, status: status === "accepted" ? 200 : status === "denied" ? 403 : ["closed", "own"].includes(status) ? 409 : status === "missing" ? 404 : 422 };
  });
}

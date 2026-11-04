import { notFound, redirect } from "next/navigation";
import { codeShaped, joinTarget } from "@/lib/room/join";
export const dynamic = "force-dynamic";

// live.clearway.co/CODE: the room link the TV shows and its QR code opens. Anything
// that isn't shaped like a code gets the app's not-found page.
export default async function RoomCode({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!codeShaped(code)) notFound();
  redirect((await joinTarget(code)).path);
}

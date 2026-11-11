import { notFound, redirect } from "next/navigation";
import { codeShaped, joinTarget, nameShaped } from "@/lib/room/join";
export const dynamic = "force-dynamic";

// live.clearway.co/CODE: the room link the TV shows and its QR code opens. Anything
// that isn't shaped like a code gets the app's not-found page.
export default async function RoomCode({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (codeShaped(code)) redirect((await joinTarget(code)).path);
  // A chosen link name opens its room. Any other word is a page that doesn't exist.
  if (!nameShaped(code)) notFound();
  const target = await joinTarget(code);
  if (!target.found) notFound();
  redirect(target.path);
}

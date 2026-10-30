import { notFound } from "next/navigation";
import { RoomAccess } from "@/components/room/room-access";
import { uuid } from "@/lib/room/policy";

export const dynamic = "force-dynamic";
export default async function ConfirmSignIn({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ challenge?: string; token?: string }> }) {
  const { id } = await params; const { challenge, token } = await searchParams;
  if (!uuid(id) || !uuid(challenge) || !token || !/^[0-9a-f]{64}$/.test(token)) notFound();
  // Rendering this page never contacts Auth, verifies a proof or creates a device session.
  return <main id="main" className="page-width narrow"><h1>Confirm your sign-in.</h1><RoomAccess engagement={id} confirm={{ challenge, token }} /></main>;
}

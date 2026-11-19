import { notFound, redirect } from "next/navigation";
import { uuid } from "@/lib/room/policy";

export default async function DoorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid(id)) notFound();
  redirect(`/admin/${id}/joining?filter=in-the-room`);
}

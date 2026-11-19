import { notFound, redirect } from "next/navigation";
import { uuid } from "@/lib/room/policy";

export default async function PeopleAlias({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid(id)) notFound();
  redirect(`/admin/${id}/joining`);
}

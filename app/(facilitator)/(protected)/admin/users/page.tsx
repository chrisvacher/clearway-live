import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { teamHubConfigured } from "@/lib/server/team-hub";
import { UserAdmin, type ClearwayUser } from "@/components/facilitator/user-admin";

export const metadata = { title: "Clearway users" };

export default async function UsersPage() {
  const { profile, client } = await requireFacilitator();
  if (!profile.is_admin) notFound();
  const available = await client.rpc("clearway_user_admin_list");
  if (!available.error && available.data?.status === "ok") {
    return <UserAdmin configured={teamHubConfigured()} users={available.data.users as ClearwayUser[]} canManage profileId={profile.id} />;
  }
  const { data, error } = await client.from("clearway_users").select("id,name,email,is_admin").eq("deleted", false).eq("kind", "person").order("name");
  return <UserAdmin configured={teamHubConfigured()} users={data ?? []} loadFailed={Boolean(error)} profileId={profile.id} />;
}

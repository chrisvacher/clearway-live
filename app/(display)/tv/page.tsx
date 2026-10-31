import { initialTv } from "@/lib/tv/server";
import { TvScreen } from "@/components/tv/tv-screen";
export const dynamic = "force-dynamic";
export const metadata = { title: "TV" };
export default async function TvPage() { return <TvScreen initial={await initialTv()} />; }

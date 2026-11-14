import { initialTv } from "@/lib/tv/server";
import { TvScreen } from "@/components/tv/tv-screen";
import { brandFor } from "@/lib/brand";
import { addressSkin } from "@/lib/brand/request";
import { screenPage } from "@/lib/brand/metadata";
export const dynamic = "force-dynamic";
// The tab's title and icon follow the address the TV opened (live.novetera.co/tv pairs in Novetera). Once paired, the screen draws the engagement's skin.
export async function generateMetadata() { return screenPage(await addressSkin(), "TV"); }
export default async function TvPage() {
  const skin = await addressSkin();
  return <TvScreen initial={await initialTv()} address={{ skin, host: brandFor(skin).host }} />;
}

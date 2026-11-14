import Link from "next/link";
import { LiveWordmark } from "@/components/brand/live-wordmark";
import { NoveteraLockup } from "@/components/brand/novetera-lockup";
import { screensFor } from "@/lib/brand/screens";
import type { Skin } from "@/lib/brand";

// The Clearway Live lockup is the only way the app names itself. A room-facing page in the Novetera skin carries the Novetera lockup instead.
export function SiteHeader({ skin = "clearway" }: { skin?: Skin }) {
  if (skin === "novetera") return <header className="header page-width">
    <Link href="/" className="brand" aria-label={screensFor("novetera").homeLabel}><NoveteraLockup size="app" label={null} /></Link>
  </header>;
  return <header className="header page-width">
    <Link href="/" className="brand" aria-label="Clearway Live home"><LiveWordmark label={null} /></Link>
  </header>;
}

import Link from "next/link";
import { LiveWordmark } from "@/components/brand/live-wordmark";

// The Clearway Live lockup is the only way the app names itself.
export function SiteHeader() {
  return <header className="header page-width">
    <Link href="/" className="brand" aria-label="Clearway Live home"><LiveWordmark label={null} /></Link>
  </header>;
}

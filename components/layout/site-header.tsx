import Link from "next/link";

export function SiteHeader() {
  return <header className="header page-width">
    <Link href="/" className="brand" aria-label="Clearway Live home">clearway<span>live</span></Link>
    <span className="header-note">Space to listen. Clarity to move.</span>
  </header>;
}

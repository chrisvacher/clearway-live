"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function EngagementLinks({ links }: { links: string[][] }) {
  const pathname=usePathname();
  return <div className="engagement-nav-links">{links.map(([href,label])=><Link key={href} href={href} aria-current={pathname===href?"page":undefined}>{label}</Link>)}</div>;
}

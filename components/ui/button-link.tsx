import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function ButtonLink({ href, children, className }: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return <Link href={href} className={cn("button-link", className)}>
    {children}<ArrowRight size={18} aria-hidden="true" />
  </Link>;
}

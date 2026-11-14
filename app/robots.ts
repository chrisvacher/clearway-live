import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { skinForHost } from "@/lib/brand";
// Both addresses are kept out of search engines. live.novetera.co is named so it stays hidden if Clearway's rules ever change.
export default async function robots(): Promise<MetadataRoute.Robots> {
  if (skinForHost((await headers()).get("host")) === "novetera") return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", disallow: "/" } };
}

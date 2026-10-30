import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ] }, { source: "/auth/:path*", headers: [
      { key: "Referrer-Policy", value: "no-referrer" },
    ] }, { source: "/room/:id/confirm", headers: [
      { key: "Referrer-Policy", value: "strict-origin" },
      { key: "Cache-Control", value: "private, no-store" },
    ] }, { source: "/room/:path*", headers: [
      { key: "Cache-Control", value: "private, no-store" },
    ] }];
  },
};

export default nextConfig;

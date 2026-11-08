import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/room/**": ["./design/clearway-base/colors_and_type.css", "./design/clearway-live/live_tokens.css"],
    // The report export reads Plus Jakarta Sans (the design system's full font files) and the Clearway logo from disk.
    // pdfkit (under @react-pdf/renderer) loads its built-in fonts through "#standard-fonts/*" subpath imports and a hashed chunk file, which file tracing
    // does not follow, so the PDF failed on Vercel with "Cannot find module .../pdfkit/js/standard-fonts/Helvetica.cjs". It sets Helvetica on every render.
    "/api/control/*/report/export": [
      "./design/clearway-base/fonts/PlusJakartaSans-*.ttf",
      "./lib/export/assets/clearway-logo-dark.png",
      "./node_modules/pdfkit/js/standard-fonts/**",
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ] }, { source: "/v/:path*", headers: [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Cache-Control", value: "private, no-store" },
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

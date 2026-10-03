import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static game art never changes at runtime: cache aggressively so Vercel's
  // edge serves the Kenney PNGs from the CDN on repeat visits.
  async headers() {
    return [
      {
        source: "/assets/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
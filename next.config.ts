import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "35mb",
    },
  },
  images: {
    // Must match the buckets our own thumbnail route actually builds
    // (src/lib/thumbnails.ts WIDTHS). Otherwise next/image labels a srcset
    // candidate with a width the server can't deliver, and the browser
    // stretches an undersized image to fill it — the bug this fixes.
    deviceSizes: [640, 828, 1080, 1200, 1920, 2560, 3200],
  },
};

export default nextConfig;

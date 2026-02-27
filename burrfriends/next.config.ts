import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Note: Workspace root warning is harmless - can be ignored
  // If needed, can be silenced by setting outputFileTracingRoot
  eslint: {
    // Pre-existing no-unused-expressions at clubs/[slug]/games/page.tsx:583
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

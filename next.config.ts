import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native module: must be loaded by Node at runtime, not bundled.
  serverExternalPackages: ["@lancedb/lancedb"],
};

export default nextConfig;

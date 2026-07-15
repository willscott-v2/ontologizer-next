import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root: a stray package.json in a parent directory
    // otherwise makes Turbopack resolve modules from the wrong root.
    root: __dirname,
  },
};

export default nextConfig;

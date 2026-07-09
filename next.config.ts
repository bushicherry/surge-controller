import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Standalone output is only for the Docker image (started via `node server.js`).
  // Native/launchd runs `next start`, which is incompatible with standalone.
  output: process.env.BUILD_STANDALONE ? "standalone" : undefined,
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;

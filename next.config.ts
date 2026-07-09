import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle at .next/standalone for Docker.
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;

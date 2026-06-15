import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    // Next 15 already moved serverComponentsExternalPackages → serverExternalPackages
  },
};

export default nextConfig;

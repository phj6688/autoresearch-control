import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  basePath: "/proxy/autoresearch",
  assetPrefix: "/proxy/autoresearch",
};

export default nextConfig;

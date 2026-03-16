import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  basePath: "/proxy/autoresearch",
  headers: async () => [
    {
      source: "/_next/static/:path*",
      headers: [
        { key: "Cache-Control", value: "public, max-age=31536000, immutable, no-transform" },
      ],
    },
    {
      source: "/:path((?!_next/static).*)",
      headers: [
        { key: "Cache-Control", value: "no-transform" },
      ],
    },
  ],
};

export default nextConfig;

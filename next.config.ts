import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Loaded by Node at runtime instead of bundled (PGlite ships WebAssembly and data files).
  serverExternalPackages: ["@electric-sql/pglite"],
  devIndicators: false,
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Loaded by Node at runtime instead of bundled (PGlite ships WebAssembly and data files).
  serverExternalPackages: ["@electric-sql/pglite"],
  devIndicators: false,
  webpack(config) {
    // paper.js has optional Node-only paths (jsdom/canvas) for server-side drawing. The editor
    // only runs paper.js in the browser, so stub them out of every bundle.
    config.resolve.alias = {
      ...config.resolve.alias,
      jsdom: false,
      canvas: false,
      "jsdom/lib/jsdom/living/generated/utils": false,
      "jsdom/lib/generated/idl/utils": false,
      "source-map-support": false,
    };
    return config;
  },
};

export default nextConfig;

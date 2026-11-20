import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { include: ["tests/api/**/*.test.ts"], environment: "node", testTimeout: 60000, hookTimeout: 60000, fileParallelism: false },
});

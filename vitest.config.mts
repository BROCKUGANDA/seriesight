import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    // Integration-style unit tests share one SQLite database. Running files in
    // parallel lets them race over the same tables and causes spurious timeouts
    // in CI and in the release gates, so execute test files serially.
    fileParallelism: false,
    // Password hashing and SQLite writes are slow on loaded CI/dev machines.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});

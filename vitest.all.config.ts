import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/unit/**/*.test.{ts,tsx}",
      "tests/integration/**/*.test.{ts,tsx}",
      "tests/offline/**/*.test.{ts,tsx}",
      "src/components/map/shared/__tests__/**/*.test.{ts,tsx}"
    ],
    exclude: ["tests/e2e/**", "tests/offline/*.spec.ts", "node_modules/**"],
  },
});

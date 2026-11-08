import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // Support the "@/..." path alias used in app code.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Keep e2e (Playwright) out of the vitest run.
    exclude: ["node_modules/**", "e2e/**"],
  },
});

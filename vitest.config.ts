import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Next's PostCSS loader accepts plugin names; Vite's loader expects plugin instances.
  // Component tests exercise the DOM rather than re-running the production Tailwind pipeline.
  css: { postcss: { plugins: [] } },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    testTimeout: 20_000,
  },
});

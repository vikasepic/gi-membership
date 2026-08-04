import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    // .tsx too, so a component can be rendered to markup and asserted on.
    include: ["**/*.test.ts", "**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 30_000, // integration tests hit the real Stripe test API
  },
  // Component tests render to markup, so the test files contain JSX.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
      "server-only": resolve(__dirname, "test/server-only-stub.ts"),
    },
  },
});

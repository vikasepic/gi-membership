import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    // .tsx too, so a component can be rendered to markup and asserted on.
    include: ["**/*.test.ts", "**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 30_000, // integration tests hit the real Stripe test API
    // Cleanup hooks cancel Stripe subscriptions and delete rows one round
    // trip at a time, so they need the same allowance the tests got. On the
    // default 10s they time out under a full parallel run, leave their
    // fixtures behind, and the next run fails on the leftovers instead.
    hookTimeout: 30_000,
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

import { existsSync } from "node:fs";

// Load .env.local so integration tests can reach local Supabase + Stripe test
// mode. Unit tests don't need it but it's harmless. Node 20.6+ / 24 built-in.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

/**
 * The public variables, guaranteed.
 *
 * Loading .env.local and stopping there made the test environment whatever the
 * developer happened to have on disk. Anything reading publicEnv() then passed
 * here and threw a ZodError in CI, where that file does not exist — a test that
 * is green on the machine that wrote it and red for everyone else, which is the
 * least useful state a test can be in.
 *
 * Filled in only where absent, so a real .env.local still wins and the
 * integration suites keep talking to the local stack. These are placeholders on
 * purpose: anything that needs a REAL value has an integration guard and skips
 * without one, and a fake key that reached a real service would be worse than a
 * missing one.
 */
const PUBLIC_DEFAULTS: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_placeholder",
};
for (const [key, value] of Object.entries(PUBLIC_DEFAULTS)) {
  if (!process.env[key]) process.env[key] = value;
}

// React needs to be told it is under test, or `act()` does not flush: it hands
// the work to the concurrent scheduler instead, which runs it on a later tick.
// When that tick lands after the jsdom environment has been torn down, React
// reaches for `window` and there is none — an unhandled error that fails the
// run while every test still reports as passing. That is what made CI red on
// some pushes and green on others with no change between them.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

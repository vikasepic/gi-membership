import { existsSync } from "node:fs";

// Load .env.local so integration tests can reach local Supabase + Stripe test
// mode. Unit tests don't need it but it's harmless. Node 20.6+ / 24 built-in.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

// React needs to be told it is under test, or `act()` does not flush: it hands
// the work to the concurrent scheduler instead, which runs it on a later tick.
// When that tick lands after the jsdom environment has been torn down, React
// reaches for `window` and there is none — an unhandled error that fails the
// run while every test still reports as passing. That is what made CI red on
// some pushes and green on others with no change between them.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

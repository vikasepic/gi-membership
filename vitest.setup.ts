import { existsSync } from "node:fs";

// Load .env.local so integration tests can reach local Supabase + Stripe test
// mode. Unit tests don't need it but it's harmless. Node 20.6+ / 24 built-in.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

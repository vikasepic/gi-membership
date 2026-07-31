import { z } from "zod";

// Lazy, validated env access. Not evaluated at import time so the app can be
// built/scaffolded before Supabase/Stripe are provisioned. Call the getter at
// the point of use; it throws a clear error only if something's actually missing.

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export function publicEnv() {
  return publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

export function serverEnv() {
  return serverSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}

const stripeServerSchema = z.object({
  STRIPE_SECRET_KEY: z.string().startsWith("sk_", "Must be a Stripe secret key"),
});

export function stripeSecretKey(): string {
  return stripeServerSchema.parse({ STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY }).STRIPE_SECRET_KEY;
}

export function stripePublishableKey(): string {
  const key = z
    .string()
    .startsWith("pk_", "Must be a Stripe publishable key")
    .parse(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

  // The two keys must belong to the same Stripe mode. Mixing them is the classic
  // go-live mistake — swap the secret to live but leave the publishable on test
  // and the Payment Element mints a test PaymentMethod that the live API then
  // refuses, mid-checkout, with a message that blames the card. Failing here
  // instead means the mistake surfaces at boot, not at someone's first purchase.
  const secretLive = (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_");
  const publishableLive = key.startsWith("pk_live_");
  if (secretLive !== publishableLive) {
    throw new Error(
      `Stripe key mode mismatch: secret is ${secretLive ? "LIVE" : "TEST"} but publishable is ` +
        `${publishableLive ? "LIVE" : "TEST"}. Both must be the same mode.`,
    );
  }
  return key;
}

// Secret for signing single-use OTO tokens.
export function otoSigningSecret(): string {
  return z.string().min(16, "OTO_SIGNING_SECRET must be ≥16 chars").parse(process.env.OTO_SIGNING_SECRET);
}

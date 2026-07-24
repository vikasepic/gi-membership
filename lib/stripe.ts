import "server-only";
import Stripe from "stripe";
import { stripeSecretKey } from "@/lib/env";

// Server-side Stripe client. Test mode only until launch (key is validated to
// start with sk_; a live key still works but we never set one until approved).
let cached: Stripe | null = null;

export function stripe(): Stripe {
  if (!cached) {
    cached = new Stripe(stripeSecretKey());
  }
  return cached;
}

// Which Stripe price-id column to read for the current mode.
export function stripeMode(): "test" | "live" {
  return stripeSecretKey().startsWith("sk_live_") ? "live" : "test";
}

"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { createCheckoutIntent, finalizeOrder, type CheckoutResult } from "@/lib/checkout";
import { CONSENT_COOKIE, parseConsent, mayTrack } from "@/lib/consent";

const schema = z.object({
  productSlug: z.string().min(1),
  email: z.string().email("Enter a valid email"),
  username: z.string().trim().min(2, "Username too short"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  bumpTaken: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === "true" || v === "on"),
  country: z.string().trim().optional().nullable(),
});

export async function startCheckout(input: unknown): Promise<CheckoutResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join(", ") };
  }
  // Consent is read server-side from the cookie, never trusted from the client
  // payload, and stored on the order so the (cookie-less) webhook can honour it.
  const jar = await cookies();
  const anonId = jar.get("gi_anon")?.value ?? null;
  const trackingConsent = mayTrack(parseConsent(jar.get(CONSENT_COOKIE)?.value));
  return createCheckoutIntent({ ...parsed.data, anonId, trackingConsent });
}

// Called by the thank-you page after Stripe redirects back. Idempotent — the
// webhook (once wired) calls the same finalizeOrder.
export async function confirmCheckout(paymentIntentId: string): Promise<void> {
  if (paymentIntentId) await finalizeOrder(paymentIntentId);
}

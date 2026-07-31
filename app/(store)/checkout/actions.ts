"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { createCheckoutIntent, finalizeOrder, type CheckoutResult } from "@/lib/checkout";
import { CONSENT_COOKIE, parseConsent, mayTrack } from "@/lib/consent";
import { createClient } from "@/lib/supabase/server";
import { getProductBySlug } from "@/lib/store";
import { resolveCoupon } from "@/lib/coupons";

// Details are only required from a visitor who isn't signed in; a member
// already has an account, so those fields are optional here and validated
// below once we know which case we're in.
const schema = z.object({
  productSlug: z.string().min(1),
  email: z.string().email("Enter a valid email").optional(),
  fullName: z.string().trim().min(2, "Enter your full name").optional(),
  couponCode: z.string().trim().max(64).optional().nullable(),
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

  // Whose purchase this is comes from the session cookie, never the payload.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const existingUserId = user?.id ?? null;

  if (!existingUserId) {
    const { email, fullName } = parsed.data;
    if (!email || !fullName) {
      return { ok: false, error: "Enter your name and email to continue." };
    }
  }
  // Consent is read server-side from the cookie, never trusted from the client
  // payload, and stored on the order so the (cookie-less) webhook can honour it.
  const jar = await cookies();
  const anonId = jar.get("gi_anon")?.value ?? null;
  const trackingConsent = mayTrack(parseConsent(jar.get(CONSENT_COOKIE)?.value));
  return createCheckoutIntent({ ...parsed.data, existingUserId, anonId, trackingConsent });
}

// Called by the thank-you page after Stripe redirects back. Idempotent — the
// webhook (once wired) calls the same finalizeOrder.
export async function confirmCheckout(paymentIntentId: string): Promise<void> {
  if (paymentIntentId) await finalizeOrder(paymentIntentId);
}

/**
 * Price a coupon for display before anything is charged.
 *
 * The number returned here is only ever shown. createCheckoutIntent resolves the
 * same code again at charge time through the same function, so a tampered
 * preview cannot become a tampered charge.
 */
export async function previewCoupon(
  productSlug: string,
  code: string,
): Promise<{ ok: true; label: string; discountCents: number; clamped: boolean } | { ok: false; error: string }> {
  const product = await getProductBySlug(productSlug);
  if (!product || product.status !== "published") {
    return { ok: false, error: "Product not available" };
  }
  const res = await resolveCoupon(code, product.priceCents, product.currency);
  if (!res.ok) return res;
  return {
    ok: true,
    label: res.coupon.label,
    discountCents: res.coupon.discountCents,
    clamped: res.coupon.clamped,
  };
}

"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { createCheckoutIntent, finalizeOrder, type CheckoutResult } from "@/lib/checkout";
import { CONSENT_COOKIE, parseConsent, mayTrack } from "@/lib/consent";
import { createClient } from "@/lib/supabase/server";
import { getProductBySlug } from "@/lib/store";
import { resolveCoupon } from "@/lib/coupons";
import { rememberLead } from "@/lib/leads";
import { looksLikeEmail } from "@/lib/email-hint";

// Details are only required from a visitor who isn't signed in; a member
// already has an account, so those fields are optional here and validated
// below once we know which case we're in.
const schema = z.object({
  productSlug: z.string().min(1),
  email: z.string().email("Enter a valid email").optional(),
  fullName: z.string().trim().min(2, "Enter your full name").optional(),
  couponCode: z.string().trim().max(64).optional().nullable(),
  // Which of the bump's prices was taken. A SIDE, never an offer id — the
  // server resolves the alternative through the offer's own alt_offer_id, so
  // the worst a tampered post can do is buy the second price it was shown.
  // The old boolean still parses: a page loaded before this shipped and
  // submitted after it must not silently lose the bump someone ticked.
  bumpChoice: z
    .union([z.enum(["none", "main", "alt"]), z.boolean(), z.string()])
    .optional()
    .transform((v) => {
      if (v === "alt") return "alt" as const;
      if (v === "main") return "main" as const;
      if (v === true || v === "true" || v === "on") return "main" as const;
      return "none" as const;
    }),
  bumpTaken: z.union([z.boolean(), z.string()]).optional(),
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

/**
 * Start the abandoned-cart timer as soon as we know who they are — on the email
 * field losing focus, before any card is entered.
 *
 * Returns nothing and reports nothing. It is a side effect on a marketing
 * system; a buyer must never see it fail, and a caller must not be able to
 * learn anything from its response.
 */
export async function captureAbandonedCart(
  productSlug: string,
  email: string,
  fullName?: string,
): Promise<void> {
  const parsed = z
    .object({
      productSlug: z.string().min(1),
      email: z.string().email(),
      fullName: z.string().trim().max(200).optional(),
    })
    .safeParse({ productSlug, email, fullName });
  if (!parsed.success) return;

  const product = await getProductBySlug(parsed.data.productSlug);
  if (!product || product.status !== "published") return;

  if (!looksLikeEmail(parsed.data.email)) return;

  // Buffered, not sent. The sweep forwards it in LEAD_DELAY_MINUTES if they
  // still have not bought — so a typo corrected ten seconds from now simply
  // overwrites this row, and someone who checks out in two minutes never
  // reaches ActiveCampaign at all.
  //
  // The visitor key is the attribution cookie, read server-side. A caller
  // cannot choose it, so nobody can overwrite another visitor's row.
  const jar = await cookies();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const visitorKey = user?.id ?? jar.get("gi_anon")?.value ?? null;
  if (!visitorKey) return;

  await rememberLead({
    visitorKey,
    productId: product.id,
    email: parsed.data.email,
    fullName: parsed.data.fullName ?? null,
  });
}

import { requireAdmin } from "@/lib/admin-guard";
import CheckoutPage from "@/app/(store)/checkout/page";
import { NOINDEX } from "@/lib/seo";

export const metadata = NOINDEX;
export const dynamic = "force-dynamic";

/**
 * The checkout, at a URL that may be framed.
 *
 * The design editor shows the real page in an iframe so what an admin approves
 * is literally what a buyer meets. It never loaded: /checkout is covered by the
 * catch-all `X-Frame-Options: DENY` and `frame-ancestors 'none'` in
 * next.config.ts, which exists because clickjacking a checkout is a real
 * attack — a transparent frame over a pay button is the textbook version of
 * it. Relaxing that header to fix a preview would trade the thing it protects
 * for a convenience.
 *
 * So: a second URL, admin-only, allowed to be framed by this site alone. Same
 * shape as /oto-preview and /course-preview, which exist for the same reason.
 *
 * It RE-EXPORTS the checkout rather than reimplementing it. A preview that
 * renders its own approximation is a second renderer to keep in step, and the
 * editor's whole claim — "there is no second renderer to fall out of step" —
 * would stop being true the first time somebody changed one and not the other.
 *
 * Nothing is created by opening this. The PaymentIntent is deferred until
 * submit, so the page can be rendered as often as anybody likes without
 * writing an order.
 *
 * In this frame the admin is signed in, so the checkout shows its known-buyer
 * form rather than the one a stranger meets: no "Where should we send it?"
 * step, and their own address already filled. Colours, toggles and layout —
 * everything this editor changes — render identically either way.
 */
export default async function CheckoutPreviewPage(props: {
  searchParams: Promise<{ product?: string; skin?: string }>;
}) {
  await requireAdmin();
  return <CheckoutPage {...props} />;
}

import { notFound } from "next/navigation";
import { verifyPreviewToken } from "@/lib/preview-token";
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
 * Authorised by a signed token in the URL, not by the session. A cookie set
 * SameSite=Lax is sent on top-level navigations only, and loading a document
 * into an iframe is not one — so requireAdmin() here saw no session however
 * signed-in the admin was, redirected the frame to /login and then to the
 * store root, which refuses to be framed at all. The panel showed a broken
 * document and the server answered 200 throughout. See lib/preview-token.ts.
 *
 * The frame is signed out, so this renders the checkout a stranger meets —
 * which is the more useful preview anyway, and the one most buyers see.
 */
export default async function CheckoutPreviewPage(props: {
  searchParams: Promise<{ product?: string; skin?: string; t?: string }>;
}) {
  const { t } = await props.searchParams;
  // notFound, not redirect: a redirect inside a frame is what broke this, and
  // a 404 rendered in place is something an admin can actually see.
  if (!verifyPreviewToken(t, "checkout")) notFound();
  return <CheckoutPage {...props} />;
}

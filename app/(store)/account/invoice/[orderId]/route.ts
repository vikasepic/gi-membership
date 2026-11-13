import { viewer } from "@/lib/view-as";
import { invoiceForOrder } from "@/lib/order-invoice";

/**
 * The account page's Invoice link: Stripe's invoice for one of the member's
 * own purchases, made on the first click and found on every later one
 * (lib/order-invoice). Spec:
 * docs/superpowers/specs/2026-11-13-stripe-invoice-per-purchase-design.md.
 *
 * An admin viewing as the member can open an invoice that exists but never
 * makes one: making it costs a Stripe fee and freezes the member's billing
 * details as they stand.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  // Relative for our own pages: behind the proxy req.url is the container's address.
  const go = (location: string) => new Response(null, { status: 303, headers: { Location: location } });
  const user = await viewer();
  if (!user) return go("/login?next=/account");

  const { orderId } = await ctx.params;
  const r = await invoiceForOrder({ orderId, userId: user.id, create: !user.viewingAs });
  if (r.ok) {
    const url = r.hostedUrl ?? r.pdfUrl;
    if (url) return go(url);
  }
  return go(!r.ok && r.reason === "view_only" ? "/account?invoice=view-as" : "/account?invoice=unavailable");
}

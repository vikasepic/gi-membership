import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { CheckoutPrototype } from "@/components/admin/checkout-prototype";
import { NOINDEX } from "@/lib/seo";

/**
 * What a checkout editor would look like.
 *
 * Unlinked, reads nothing, writes nothing. The checkout is the one page where
 * being wrong costs money directly, so the shape of its editor is worth
 * arguing about before there is a settings blob and a form behind it.
 *
 * Delete this route when the real one lands.
 */
export const metadata = NOINDEX;

export default async function CheckoutPrototypePage() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link href="/admin" className="kicker text-muted hover:text-fg">
          &larr; Admin
        </Link>
        <h1 className="text-xl">Checkout editor</h1>
        <span className="text-sm text-muted">a prototype — nothing here saves</span>
      </div>
      <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
        Everything on the checkout is currently a decision made in code — which
        reassurances appear, what the button says, whether there is a coupon box
        at all. They are all defensible and none of them is adjustable, so
        &ldquo;can we try it without the coupon field&rdquo; has meant a deploy.
        This is the shape of the editor that would change that. Type into it.
      </p>
      <CheckoutPrototype />
    </div>
  );
}

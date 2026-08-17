import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { getSettings } from "@/lib/settings";
import { listPublishedProducts } from "@/lib/store";
import { CheckoutDesignForm } from "@/components/admin/checkout-design-form";

export const dynamic = "force-dynamic";

/**
 * The checkout, and the short list of things about it a store can change.
 *
 * This was the page builder pointed at the checkout: every block a sales page
 * has, arranged freely, plus a guard on the live page that checked each saved
 * arrangement for card fields, a total and a pay button and silently fell back
 * to the shipped one when a part was missing. The editor was elaborate, the
 * guard existed because the editor was elaborate, and neither of them made a
 * single checkout better — a store wanted its colours and a couple of things
 * hidden, and got a canvas on which it could build a page that took no money.
 *
 * Three colours and a list of switches now. Everything anybody actually asked
 * for, and nothing that can produce a page which cannot sell.
 *
 * One checkout for every product. What differs between two of them — the item,
 * the price, the bump — comes off the order, not out of an editor.
 */
export default async function CheckoutDesignPage() {
  await requireAdmin();
  const [settings, products] = await Promise.all([getSettings(), listPublishedProducts()]);

  // Something real to look at it on. The preview is the live checkout in a
  // frame rather than a drawing of one, so what is approved here is literally
  // what a buyer meets — there is no second renderer to fall out of step.
  const sample = products[0]?.slug ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link href="/admin" className="kicker text-muted hover:text-fg">
          &larr; Admin
        </Link>
        <h1 className="text-xl">Checkout</h1>
        <span className="text-sm text-muted">one design, every product</span>
      </div>

      <CheckoutDesignForm settings={settings} previewSlug={sample} />
    </div>
  );
}

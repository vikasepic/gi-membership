import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { PricingPrototype } from "@/components/admin/pricing-prototype";
import { UpsellPrototype } from "@/components/admin/upsell-prototype";
import { NOINDEX } from "@/lib/seo";

/**
 * Pricing variations, before there is a database behind them.
 *
 * Not linked from the admin navigation, on purpose: this is a design to argue
 * with, not a screen anybody should find by accident. It reads nothing and
 * writes nothing — every figure on it is fabricated, and the real editors are
 * where real prices are set. It stays because the surfaces further down the
 * funnel are not built yet, and the cheapest place to disagree about a design
 * is before it is wired to money.
 *
 * Inline rather than in an iframe, unlike the OTO preview: two of the three
 * panels ARE admin screens, so the admin's own width is the honest one to see
 * them at. The third is the real checkout component at the two widths the
 * checkout actually gives it.
 *
 * Delete this route when the last slice lands.
 */
export const metadata = NOINDEX;

export default async function PricingPrototypePage() {
  await requireAdmin();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link href="/admin" className="kicker text-muted hover:text-fg">
          &larr; Admin
        </Link>
        <h1 className="text-xl">Pricing variations</h1>
        <span className="text-sm text-muted">a prototype — nothing here saves</span>
      </div>

      <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
        Today one offer holds one price, so selling the same thing monthly and
        yearly meant building two whole offers and pairing them with a
        &ldquo;Second price&rdquo; dropdown, and two was the ceiling. The offer
        editor and the checkout bump are live now — this is where the surfaces
        after them get argued about first. Type into it: every panel is wired to
        the same prices, so what you tick above is what is drawn below.
      </p>

      <PricingPrototype />

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border pt-6">
        <h2 className="font-display text-lg">After the checkout</h2>
        <span className="text-sm text-muted">
          the upsell, its sticky bar, and the sales page — same prices, three places
        </span>
      </div>

      <UpsellPrototype />
    </div>
  );
}

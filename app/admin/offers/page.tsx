import Link from "next/link";
import { listOffers, listAllProducts } from "@/lib/admin";
import { productDisplay } from "@/lib/courses";
import { usesOf, termsOf } from "@/lib/catalogue-view";
import { CatalogueThumb } from "@/components/admin/catalogue-thumb";

import { money } from "@/lib/money";
import { livePrices, priceLabel, priceTerms } from "@/lib/offer-prices";

export default async function AdminOffersPage() {
  const [offers, products] = await Promise.all([listOffers(), listAllProducts()]);

  // Where each offer is attached. Offers are the only shared records in the
  // store — everything else belongs to one thing, an offer is deliberately
  // reused — and reuse without visibility is how a price changes somewhere
  // nobody was looking.
  const uses = new Map(offers.map((o) => [o.id, usesOf(o, products)]));

  // An offer that grants a product borrows that product's artwork; one that
  // grants an app has none of its own.
  const granted = products.filter((p) => offers.some((o) => o.grantProductId === p.id));
  const display = await productDisplay(granted.map((p) => p.id));
  const coverFor = (productId: string | null) => {
    if (!productId) return null;
    const p = products.find((x) => x.id === productId);
    return p?.coverPath ?? display.get(productId)?.coverPath ?? null;
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl">Offer library</h1>
        <Link
          href="/admin/offers/new"
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
        >
          + New offer
        </Link>
      </div>

      <p className="max-w-2xl text-sm text-muted">
        Define an offer once, attach it to any product&rsquo;s bump or OTO slot. An offer is never
        shown to a buyer who already owns what it grants.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="border-b border-border text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Offer</th>
              <th className="px-4 py-3 font-medium">Grants</th>
              <th className="px-4 py-3 font-medium">Terms</th>
              <th className="px-4 py-3 font-medium">Price</th>
              {/* The question this page could not answer: changing a price here
                  changes it everywhere it is attached. */}
              <th className="px-4 py-3 font-medium">Used by</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {offers.map((o) => (
              <tr key={o.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2.5">
                    <CatalogueThumb coverPath={coverFor(o.grantProductId)} />
                    <span className="flex min-w-0 flex-col">
                      <span>{o.name}</span>
                      {!o.active && <span className="text-xs text-primary">inactive</span>}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">
                  {o.grantType === "subscription" ? "App subscription" : "Product"}
                </td>
                {/* Every way to pay, not just the headline one. An offer sold
                    monthly AND yearly read here as if it had one price, which
                    is the row somebody scans to check what they built. */}
                <td className="px-4 py-3 text-muted">
                  {livePrices(o.prices).length > 1
                    ? livePrices(o.prices)
                        .map((p) => priceTerms(p, o.currency) ?? "one-time")
                        .join(" · ")
                    : termsOf(o)}
                </td>
                <td className="px-4 py-3">
                  {livePrices(o.prices)
                    .map((p) => priceLabel(p, o.currency))
                    .join(" or ") || money(o.priceCents)}
                </td>
                <td className="px-4 py-3 text-sm">
                  {(uses.get(o.id) ?? []).length === 0 ? (
                    // Either a draft or a mistake, and both are worth seeing.
                    <span className="text-primary">Not attached to anything</span>
                  ) : (
                    <span className="flex flex-col gap-0.5 text-muted">
                      {(uses.get(o.id) ?? []).map((u, i) => (
                        <span key={i}>
                          {u.productTitle} <b className="font-medium text-fg">{u.slot}</b>
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/offers/${o.id}`} className="text-primary hover:underline">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {offers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  No offers yet. Create one to attach as a bump or upsell.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

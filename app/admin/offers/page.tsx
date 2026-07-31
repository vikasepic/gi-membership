import Link from "next/link";
import { listOffers } from "@/lib/admin";

import { money } from "@/lib/money";

export default async function AdminOffersPage() {
  const offers = await listOffers();

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
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Grants</th>
              <th className="px-4 py-3 font-medium">Billing</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Active</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {offers.map((o) => (
              <tr key={o.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">{o.name}</td>
                <td className="px-4 py-3 text-muted">
                  {o.grantType === "subscription" ? "App subscription" : "Product"}
                </td>
                <td className="px-4 py-3 text-muted">
                  {o.billingType === "recurring"
                    ? `${o.trialDays ? `${o.trialDays}d trial · ` : ""}per ${o.interval}`
                    : "one-time"}
                </td>
                <td className="px-4 py-3">{money(o.priceCents)}</td>
                <td className="px-4 py-3">
                  <span className={o.active ? "text-navy" : "text-muted"}>{o.active ? "yes" : "no"}</span>
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

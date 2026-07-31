import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { getOffer } from "@/lib/store";
import { immediateChargeCents } from "@/lib/offers";
import { otoComponentFor } from "@/components/oto/registry";
import { OTO_TEMPLATES } from "@/lib/oto-template";
import type { OtoView } from "@/components/oto/shell";
import { money } from "@/lib/money";

export const dynamic = "force-dynamic";

// See an upsell layout with this offer's real content, before choosing it.
//
// Renders the same components the live page renders, so what you approve here
// is what a buyer gets. The only difference is the token: this one is a
// placeholder, and accepting from a preview would be rejected by acceptOto
// exactly as any other invalid token is — the preview cannot charge anyone.
export default async function OtoPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ template?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { template } = await searchParams;

  const offer = await getOffer(id);
  if (!offer) notFound();

  const chosen = template || offer.otoTemplate;
  const view: OtoView = {
    offer,
    token: "preview",
    chargeNowCents: immediateChargeCents(offer),
    recurringNote:
      offer.billingType === "recurring"
        ? `then ${money(offer.priceCents, offer.currency)}/${offer.interval}${
            offer.trialDays ? ` after your ${offer.trialDays}-day trial` : ""
          }`
        : null,
  };

  const Template = otoComponentFor({ template: chosen, offerKey: offer.key });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-2 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="kicker text-muted">Preview — {offer.name}</span>
            <span className="text-xs text-muted">
              Real content, real layout. The accept button is inert here.
            </span>
          </div>
          <Link href={`/admin/offers/${offer.id}`} className="text-sm text-muted hover:text-fg">
            &larr; Back to the offer
          </Link>
        </div>

        <div className="flex flex-wrap gap-2">
          {[...OTO_TEMPLATES, "custom"].map((t) => (
            <Link
              key={t}
              href={`/admin/offers/${offer.id}/preview?template=${t}`}
              className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                chosen === t
                  ? "border-primary bg-primary text-primary-fg"
                  : "border-border hover:border-primary"
              }`}
            >
              {t}
              {offer.otoTemplate === t && " ✓"}
            </Link>
          ))}
        </div>
        <p className="text-xs text-muted">
          ✓ marks the layout currently saved on this offer. Previewing another does not change it —
          set it on the offer form.
        </p>
      </div>

      {/* Bordered so it is obvious where the page starts and ends. */}
      <div className="overflow-hidden rounded-2xl border border-border bg-bg px-5 md:px-8">
        <Template view={view} />
      </div>
    </div>
  );
}

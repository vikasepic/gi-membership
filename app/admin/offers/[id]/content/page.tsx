import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { getOfferById } from "@/lib/admin";
import { OfferContentForm } from "@/components/admin/offer-content-form";
import { OTO_CONTENT_KEYS, contentValue } from "@/lib/oto-content";
import { hasCustomOtoPage } from "@/components/oto/registry";

export const dynamic = "force-dynamic";

/**
 * Copy editor for an offer's bespoke upsell page.
 *
 * Only offers that HAVE a bespoke page get here: the templates already take
 * their copy from the offer's own fields, so a second editor for them would be
 * two places to change one headline.
 */
export default async function OfferContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const offer = await getOfferById(id);
  if (!offer) notFound();

  // Pre-fill with what is live — the override where one exists, the shipped
  // copy otherwise. Editing starts from the real page rather than from blanks.
  const values = Object.fromEntries(
    OTO_CONTENT_KEYS.map((k) => [k, contentValue(offer.otoPage, k)]),
  );

  const custom = hasCustomOtoPage(offer.key);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/admin/offers/${id}`}
          className="kicker w-fit text-muted hover:text-fg"
        >
          &larr; {offer.name}
        </Link>
        <h1 className="text-2xl">Upsell page copy</h1>
        <p className="max-w-[70ch] text-muted">
          Every line of the {offer.name} upsell page, in the order it appears. Changes go live as
          soon as you save.
        </p>
      </div>

      {!custom ? (
        <p className="rounded-2xl border border-border bg-surface px-5 py-4 text-sm">
          This offer uses a <strong>template</strong> layout, which takes its copy from the offer
          itself — headline, description, bullets and sections on the{" "}
          <Link href={`/admin/offers/${id}`} className="underline">
            offer page
          </Link>
          . This editor only applies to the custom-built page.
        </p>
      ) : (
        <OfferContentForm
          offerId={id}
          values={values}
          previewHref={`/admin/offers/${id}/preview?template=custom`}
        />
      )}
    </div>
  );
}

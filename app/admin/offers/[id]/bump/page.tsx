import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { getOfferById } from "@/lib/admin";
import { BumpEditor } from "@/components/admin/bump-editor";

export const dynamic = "force-dynamic";

export default async function OfferBumpPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const offer = await getOfferById(id);
  if (!offer) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={`/admin/offers/${id}`} className="kicker w-fit text-muted hover:text-fg">
          &larr; {offer.name}
        </Link>
        <h1 className="text-2xl">Order bump</h1>
        <p className="max-w-[70ch] text-muted">
          How this offer looks when it appears as a tick-box on a checkout. Changes go live as soon
          as you save.
        </p>
      </div>

      <BumpEditor offer={offer} />
    </div>
  );
}

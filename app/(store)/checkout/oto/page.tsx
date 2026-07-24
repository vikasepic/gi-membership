import Link from "next/link";
import { redirect } from "next/navigation";
import { verifyOtoToken } from "@/lib/oto-token";
import { otoSigningSecret } from "@/lib/env";
import { getOffer } from "@/lib/store";
import { immediateChargeCents } from "@/lib/offers";
import { acceptOtoAction } from "./actions";

const money = (c: number, cur: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(c / 100);

export default async function OtoPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  // A missing/invalid/expired token just bypasses to thank-you — never an error
  // page, never a charge.
  if (!token) redirect("/checkout/thank-you");
  const verified = verifyOtoToken(token!, otoSigningSecret());
  if (!verified.ok) redirect("/checkout/thank-you?oto=" + verified.reason);

  const offer = await getOffer(verified.payload.offerId);
  if (!offer) redirect("/checkout/thank-you");

  const chargeNow = immediateChargeCents(offer);
  const recurringNote =
    offer.billingType === "recurring"
      ? `then ${money(offer.priceCents, offer.currency)}/${offer.interval}${
          offer.trialDays ? ` after a ${offer.trialDays}-day trial` : ""
        }`
      : null;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8 py-10">
      <div className="flex flex-col gap-2 text-center">
        <span className="kicker text-primary">One-time offer</span>
        <h1 className="text-3xl leading-tight">{offer.headline}</h1>
        {offer.description && <p className="text-muted">{offer.description}</p>}
      </div>

      {offer.bullets.length > 0 && (
        <ul className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-6">
          {offer.bullets.map((b, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="text-primary">✓</span>
              {b}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-center gap-3">
        <span className="font-display text-3xl">
          {chargeNow === 0 ? money(0, offer.currency) : money(chargeNow, offer.currency)} now
        </span>
        {recurringNote && <span className="text-sm text-muted">{recurringNote}</span>}
      </div>

      {/* Accept is POST (server action). No card re-entry — the saved card is used. */}
      <form action={acceptOtoAction} className="flex flex-col gap-3">
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="rounded-full bg-primary px-6 py-3.5 font-medium text-primary-fg transition-colors hover:bg-primary-hover"
        >
          {offer.acceptLabel}
        </button>
      </form>

      <Link href="/checkout/thank-you?oto=declined" className="text-center text-sm text-muted hover:text-fg">
        {offer.declineLabel}
      </Link>
    </div>
  );
}

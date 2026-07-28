import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStandingOffer, listOwnedApps } from "@/lib/library";
import { coursesForUser } from "@/lib/courses";
import { immediateChargeCents } from "@/lib/offers";
import { acceptStandingOfferAction, openAppAction } from "./actions";

const TYPE_LABEL: Record<string, string> = { pdf: "Guide", audio: "Audio", video: "Video", app: "App" };

// Every outcome of acceptStandingOfferAction, in the buyer's words. Without an
// entry here the redirect lands silently and the button reads as broken — which
// is exactly how it behaved when only "added" was handled.
const OFFER_STATUS: Record<string, string> = {
  added: "Added — it’s ready in your library.",
  already_owned: "You already have this — nothing was charged.",
  unavailable: "That offer isn’t available any more.",
  no_saved_card:
    "We don’t have a card on file for you yet. Buy anything from the store once and this becomes one tap.",
  charge_failed:
    "Your saved card was declined, so nothing was charged. Update it under Account → Manage billing, then try again.",
};
const money = (c: number, cur: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(c / 100);

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ offer?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { offer: offerStatus } = await searchParams;
  const courses = await coursesForUser(user.id);
  const apps = await listOwnedApps(user.id);
  const standing = await getStandingOffer(user.id);

  return (
    <div className="flex flex-col gap-10 py-4">
      <h1 className="text-3xl">Your library</h1>

      {offerStatus && OFFER_STATUS[offerStatus] && (
        <p
          className={`rounded-xl border px-4 py-3 text-sm ${
            offerStatus === "added"
              ? "border-navy/30 bg-navy/5 text-navy"
              : "border-primary/30 bg-primary/5 text-fg"
          }`}
        >
          {OFFER_STATUS[offerStatus]}
        </p>
      )}

      {courses.length === 0 ? (
        <p className="text-muted">
          Nothing here yet.{" "}
          <Link href="/" className="text-primary hover:underline">Browse the store</Link>.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((p) => (
            <Link
              key={p.id}
              href={`/library/${p.slug}`}
              className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary"
            >
              <span className="kicker text-muted">Course</span>
              <h2 className="text-lg leading-snug">{p.title}</h2>
              {p.subtitle && <p className="flex-1 text-sm text-muted">{p.subtitle}</p>}
              <span className="text-sm text-primary group-hover:underline">Open &rarr;</span>
            </Link>
          ))}
        </div>
      )}

      {/* Connected apps — signed handoff, lands the user already signed in. */}
      {apps.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="kicker text-muted">Your apps</h2>
          <div className="flex flex-col gap-3">
            {apps.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-2xl border border-border bg-surface p-5"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-sm text-muted">
                    {a.status === "trialing" ? "On trial" : a.status}
                  </span>
                </div>
                <form action={openAppAction}>
                  <input type="hidden" name="appId" value={a.id} />
                  <button className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover">
                    Open the app &rarr;
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Standing offer for buyers who declined — one-click on the saved card. */}
      {standing && (
        <section
          className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-7"
          style={{
            backgroundImage:
              "radial-gradient(90% 60% at 100% 0%, color-mix(in srgb, var(--primary) 10%, transparent), transparent 60%)",
          }}
        >
          <span className="kicker text-primary">Still available</span>
          <h2 className="text-xl">{standing.headline}</h2>
          {standing.description && <p className="text-sm text-muted">{standing.description}</p>}
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-display text-2xl">
              {money(immediateChargeCents(standing), standing.currency)} now
            </span>
            {standing.billingType === "recurring" && (
              <span className="text-sm text-muted">
                then {money(standing.priceCents, standing.currency)}/{standing.interval}
                {standing.trialDays ? ` after a ${standing.trialDays}-day trial` : ""}
              </span>
            )}
            <form action={acceptStandingOfferAction} className="ml-auto">
              <input type="hidden" name="offerId" value={standing.id} />
              <button className="rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover">
                {standing.acceptLabel}
              </button>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}

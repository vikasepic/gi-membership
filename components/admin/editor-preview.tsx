"use client";

import { COVER_ASPECT } from "@/lib/cover";

/**
 * What you are writing, where it will be read.
 *
 * A tagline is written to be read under a title in a card, and a bump headline
 * is written to be read in a coloured box on a checkout. Writing either into a
 * bare input is writing blind, and the current answer — save it, open a tab, go
 * and look, come back — costs more than the space this takes.
 *
 * It renders from the same values the form holds, so it cannot drift from what
 * is about to be saved. It can still drift from the real page, which is the one
 * thing to keep honest: a preview nobody trusts is worse than none, because it
 * stops people checking the real one.
 */

export function StorefrontPreview({
  title,
  tagline,
  price,
  currency = "usd",
  coverUrl,
}: {
  title: string;
  tagline: string;
  price: string;
  currency?: string;
  coverUrl: string | null;
}) {
  const amount = Number(String(price).replace(/[^0-9.]/g, ""));
  const money = Number.isFinite(amount) && String(price).trim()
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount)
    : "—";

  return (
    <div className="flex flex-col gap-2">
      <span className="kicker text-muted">On the storefront</span>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {coverUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={coverUrl} alt="" className={`${COVER_ASPECT} w-full object-cover`} />
        ) : (
          <div className={`${COVER_ASPECT} w-full bg-surface-2`} />
        )}
        <div className="flex flex-col gap-1 p-3">
          <span className="text-sm font-medium leading-snug">
            {title.trim() || <span className="text-muted">Untitled</span>}
          </span>
          {tagline.trim() && <span className="text-xs leading-snug text-muted">{tagline}</span>}
          <span className="mt-1 font-display text-base">{money}</span>
        </div>
      </div>
    </div>
  );
}

/** The bump as it will sit on a checkout, when one is attached. */
export function BumpPreview({ headline, terms }: { headline: string; terms: string | null }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="kicker text-muted">On the checkout</span>
      <div className="overflow-hidden rounded-xl border-2 border-primary">
        <div className="bg-primary px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.14em] text-primary-fg">
          One more thing
        </div>
        <div className="flex flex-col gap-1 bg-surface p-3">
          <span className="text-sm font-medium leading-snug">{headline}</span>
          {terms && <span className="text-xs text-muted">{terms}</span>}
        </div>
      </div>
    </div>
  );
}

export type ReadyCheck = { ok: boolean; label: string; detail?: string };

/**
 * Whether this can actually be sold.
 *
 * A published product with no sales page and no course renders perfectly and
 * delivers nothing; today the only evidence is a conversion rate of zero, or a
 * refund. Saying it here costs a corner of one tab.
 */
export function Readiness({ checks }: { checks: ReadyCheck[] }) {
  const problems = checks.filter((c) => !c.ok).length;
  return (
    <div className="flex flex-col gap-2">
      <span className="kicker text-muted">
        {problems === 0 ? "Ready to sell" : `${problems} to sort out`}
      </span>
      <ul className="flex flex-col gap-1.5">
        {checks.map((c) => (
          <li key={c.label} className="flex items-start gap-2 text-xs">
            <span className={c.ok ? "text-navy" : "text-primary"} aria-hidden>
              {c.ok ? "✓" : "!"}
            </span>
            <span className={c.ok ? "text-muted" : "text-fg"}>
              {c.label}
              {!c.ok && c.detail && <span className="block text-muted">{c.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

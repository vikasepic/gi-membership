"use client";

import { priceSummary, shownPrices, type OfferPrice } from "@/lib/offer-prices";

/**
 * Which of an offer's prices this placement shows.
 *
 * The "second price" dropdown this replaces could only ever hold one, because
 * it was a foreign key to a whole second offer. The question was always "what
 * should THIS checkout show", which is why it lives on the placement and not on
 * the offer — one product's bump can offer monthly and yearly, another's can
 * offer only the yearly.
 *
 * Ticking nothing is not an error. It means the headline price, on its own,
 * which is exactly what every bump does today.
 */
export function PricePicker({
  label,
  hint,
  prices,
  currency,
  name,
  chosen,
  onChange,
}: {
  label: string;
  hint: string;
  prices: OfferPrice[];
  currency: string;
  name: string;
  chosen: string[];
  onChange: (next: string[]) => void;
}) {
  const live = prices.filter((p) => !p.archived);
  const shown = shownPrices(prices, chosen);

  const toggle = (id: string) =>
    onChange(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);

  return (
    <div className="flex flex-col gap-2">
      {/* One value, one field. The order is the offer's own, not the order they
          were ticked in — a checkout must not present prices in an order the
          editor never saw. */}
      <input type="hidden" name={name} value={JSON.stringify(chosen)} />

      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-[0.68rem] text-muted">{hint}</span>
      </div>

      {live.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted">
          This offer has no price that is showing. Add one on the offer itself.
        </p>
      ) : live.length === 1 ? (
        <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
          {priceSummary(live[0], currency)} — one price, so the buyer gets a tick-box.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {live.map((p) => {
            const ticked = chosen.includes(p.id);
            return (
              <li key={p.id}>
                <label
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-xs transition-colors ${
                    ticked ? "border-primary bg-primary/5" : "border-border hover:border-primary"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={ticked}
                    onChange={() => toggle(p.id)}
                    className="size-4 shrink-0 cursor-pointer"
                  />
                  <span className="min-w-0 flex-1">{priceSummary(p, currency)}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {/* Said as a sentence, because a list of ticks does not tell anybody what
          the buyer ends up looking at. The old two-dropdown version wrote the
          same kind of line and it is the part people actually read. */}
      {live.length > 0 && (
        <p className="text-[0.7rem] leading-relaxed text-muted">
          {shown.length === 1 ? (
            <>
              A tick-box for <strong className="font-medium text-fg">{priceSummary(shown[0], currency)}</strong>
              {chosen.length === 0 && " — the headline price, because nothing is ticked."}
            </>
          ) : (
            <>
              A choice of{" "}
              <strong className="font-medium text-fg">{shown.length} prices</strong>, or
              &ldquo;No thanks&rdquo;. The buyer has to answer before they can pay.
            </>
          )}
        </p>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Group, inputClass } from "@/components/admin/form-controls";
import {
  INTERVALS,
  newOfferPrice,
  priceSummary,
  type OfferPrice,
} from "@/lib/offer-prices";

/**
 * The ways to pay for one offer.
 *
 * This replaces a single price block. Selling the same thing monthly and
 * yearly used to mean building a second whole offer — its own copy, its own
 * bump design, its own OTO page, its own CRM tags — and then pairing the two
 * with a dropdown on the product. The offer is the thing; these are the ways
 * to buy it.
 *
 * The same shape as every other list in this admin: local state, one hidden
 * input carrying the JSON, and `name` a required prop rather than a default —
 * see the note on snippet-fields, where a hardcoded name once saved nothing and
 * said "Saved."
 */

/** How many people are on each price. Absent means nobody has bought yet. */
export type PriceUsage = Record<string, number>;

export function OfferPriceFields({
  prices,
  currency,
  name,
  usage = {},
  onChange,
}: {
  prices: OfferPrice[];
  currency: string;
  name: string;
  usage?: PriceUsage;
  /** For the prototype's live preview. The form posts the hidden input. */
  onChange?: (next: OfferPrice[]) => void;
}) {
  const [list, setList] = useState<OfferPrice[]>(
    prices.length > 0 ? prices : [newOfferPrice(id())],
  );

  const put = (next: OfferPrice[]) => {
    setList(next);
    onChange?.(next);
  };
  const edit = (i: number, patch: Partial<OfferPrice>) =>
    put(list.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const move = (i: number, by: number) => {
    const to = i + by;
    if (to < 0 || to >= list.length) return;
    const next = [...list];
    [next[i], next[to]] = [next[to], next[i]];
    put(next);
  };

  const live = list.filter((p) => !p.archived);

  return (
    <Group
      label="Ways to pay"
      changed={live.length}
      hint="each one is a choice the buyer can be offered — monthly, yearly, a one-off"
    >
      <input type="hidden" name={name} value={JSON.stringify(list)} />

      <ul className="flex flex-col gap-2">
        {list.map((p, i) => {
          const on = usage[p.id] ?? 0;
          return (
            <li
              key={p.id}
              className={`flex flex-col gap-2.5 rounded-xl border p-3 ${
                p.archived ? "border-dashed border-border opacity-60" : "border-border"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="flex flex-col">
                  {/* Reorder rather than drag: this list is three rows long,
                      and the order is the order the checkout shows them in. */}
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    className="px-1 text-[0.6rem] leading-3 text-muted hover:text-fg disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={i === list.length - 1}
                    onClick={() => move(i, 1)}
                    className="px-1 text-[0.6rem] leading-3 text-muted hover:text-fg disabled:opacity-30"
                  >
                    ▼
                  </button>
                </span>

                <span className="min-w-0 flex-1 text-sm">
                  {/* Derived, never typed. A sentence somebody wrote once
                      outlives the next price change and starts lying — the
                      same reason the "Save 35%" badge is computed. */}
                  {priceSummary(p, currency)}
                  {i === 0 && !p.archived && (
                    <span className="ml-2 rounded-full border border-border px-1.5 py-px text-[0.6rem] text-muted">
                      headline
                    </span>
                  )}
                  {p.archived && (
                    <span className="ml-2 text-[0.68rem] text-muted">hidden from new buyers</span>
                  )}
                </span>

                {on > 0 && (
                  <span
                    className="shrink-0 text-[0.66rem] text-muted"
                    title="Their subscription keeps its own price whatever happens here"
                  >
                    {on} on this
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => edit(i, { archived: !p.archived })}
                  className="shrink-0 rounded px-1.5 text-[0.68rem] text-muted hover:text-fg"
                >
                  {p.archived ? "Show again" : "Hide"}
                </button>
                <button
                  type="button"
                  // Never removable once anybody is on it, and never the last
                  // one. Stripe holds each subscriber's price on their own
                  // subscription, so deleting this changes nothing they pay —
                  // it only loses the record of what they are on.
                  disabled={on > 0 || live.length <= 1}
                  title={
                    on > 0
                      ? `${on} ${on === 1 ? "person is" : "people are"} on this — hide it instead`
                      : live.length <= 1
                        ? "An offer needs one way to pay"
                        : "Remove"
                  }
                  onClick={() => put(list.filter((_, j) => j !== i))}
                  className="shrink-0 rounded px-1.5 text-[0.68rem] text-muted hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 @lg:grid-cols-5">
                <label className="col-span-2 flex flex-col gap-1 text-[0.68rem] text-muted @lg:col-span-1">
                  {/* A name, not a price claim. "Best value" outlives a price
                      change; "$290 a year" does not, which is why the figures
                      beside it are derived and this is not. */}
                  Call it
                  <input
                    aria-label="Label"
                    placeholder="optional"
                    maxLength={40}
                    className={inputClass}
                    value={p.label}
                    onChange={(e) => edit(i, { label: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-[0.68rem] text-muted">
                  Bills
                  <select
                    aria-label="Bills"
                    className={inputClass}
                    value={p.billingType === "one_time" ? "one_time" : (p.interval ?? "month")}
                    onChange={(e) =>
                      edit(
                        i,
                        e.target.value === "one_time"
                          ? // A one-time purchase has nothing to trial, so the
                            // trial goes with it rather than lingering unused.
                            { billingType: "one_time", interval: null, trialDays: null }
                          : {
                              billingType: "recurring",
                              interval: e.target.value as OfferPrice["interval"],
                            },
                      )
                    }
                  >
                    <option value="one_time">Once</option>
                    {INTERVALS.map((iv) => (
                      <option key={iv} value={iv}>
                        Every {iv}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-[0.68rem] text-muted">
                  {/* This is what makes fortnightly possible: every 2 weeks. */}
                  Every
                  <input
                    aria-label="Interval count"
                    type="number"
                    min={1}
                    disabled={p.billingType !== "recurring"}
                    className={inputClass}
                    value={p.intervalCount}
                    onChange={(e) => edit(i, { intervalCount: Math.max(1, Number(e.target.value)) })}
                  />
                </label>

                <label className="flex flex-col gap-1 text-[0.68rem] text-muted">
                  Price
                  <input
                    aria-label="Price"
                    type="number"
                    min={0}
                    step={1}
                    className={inputClass}
                    value={p.priceCents / 100}
                    onChange={(e) => edit(i, { priceCents: Math.round(Number(e.target.value) * 100) })}
                  />
                </label>

                <label className="flex flex-col gap-1 text-[0.68rem] text-muted">
                  Free days
                  <input
                    aria-label="Free trial days"
                    type="number"
                    min={0}
                    placeholder="none"
                    disabled={p.billingType !== "recurring"}
                    className={inputClass}
                    value={p.trialDays ?? ""}
                    onChange={(e) =>
                      edit(i, { trialDays: e.target.value === "" ? null : Number(e.target.value) })
                    }
                  />
                </label>
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => put([...list, newOfferPrice(id())])}
        className="self-start rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:border-primary hover:text-fg"
      >
        Add a way to pay
      </button>

      <p className="text-[0.7rem] leading-relaxed text-muted">
        The first one that is showing is the headline price — it is what the
        storefront card, the sales page and the emails quote. Hiding a price
        stops it being offered to anybody new; it never changes what somebody
        already on it pays.
      </p>
    </Group>
  );
}

/** Ids are ours and never leave the browser until a save. */
function id(): string {
  const g = globalThis.crypto;
  return g && "randomUUID" in g ? g.randomUUID() : `p_${Math.random().toString(36).slice(2)}`;
}

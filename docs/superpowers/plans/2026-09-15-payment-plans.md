# Payment Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A way to pay that charges a fixed number of instalments (for example 3 monthly payments of $199) and then stops, with the buyer owning the thing outright once every instalment is paid.

**Architecture:** A plan is a recurring price with `installments` set. It rides the existing subscription path (SetupIntent, subscription, ownership, dunning) plus a Stripe subscription schedule that ends the subscription after N invoices, and one new webhook branch that turns "subscription ended after N paid invoices" into "paid off, keep ownership".

**Tech Stack:** Next.js 16, Supabase Postgres, Stripe (subscriptions, subscription schedules, webhooks), zod, vitest.

**Spec:** `docs/superpowers/specs/2026-09-15-payment-plans-design.md`

## Global Constraints

- Migration is `supabase/migrations/0085_payment_plans.sql`; `ls supabase/migrations | tail -1` first. 0084 is the last today.
- `installments` is `integer null`, CHECK `installments is null or (installments between 2 and 24 and billing_type = 'recurring')`, on `offer_prices` and `product_prices`. Every existing row stays null and behaves exactly as before.
- A plan may carry a trial. A plan with a trial gets its own trial phase in the schedule, then a billing phase of exactly `installments` iterations.
- "Paid off" is decided by counting the subscription's paid invoices with `amount_paid > 0`, never by trusting the event alone. Only `customer.subscription.deleted` can pay a plan off.
- Paid off = ownership rows for that subscription set to `status = 'active'`, `stripe_subscription_id = null`, apps pushed.
- `savingAgainst` returns null when either price is a plan.
- Copy, verbatim: label `3 × $199`; terms `3 monthly payments of $199, then it's yours`; with trial `7 days free, then 3 monthly payments of $199, then it's yours`; summary `3 × $199 monthly ($597 total)`; interval other than one month reads `3 payments of $199 every 2 months, then it's yours`; coupon on a plan `off each payment`.
- Admin Bills dropdown option: `In instalments`; new field label `How many`.
- No em dashes in new prose, comments or copy.
- Stripe is LIVE in production; the integration test runs only under `sk_test_` and inside `describe.skipIf(!canRun)`. Never print a secret.
- Run the FULL suite and `npx tsc --noEmit` before every commit that touches `lib/` or `app/`. Never push; the controller pushes after the migration is on production.

---

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/0085_payment_plans.sql` | the column and its CHECK on both price tables |
| `lib/offer-prices.ts` | `OfferPrice.installments`, labels, terms, summary, chargeNow, savingAgainst |
| `lib/payment-plans.ts` | pure: `isPlan`, `planSentence`, `planOutcome` |
| `lib/offer-terms.ts` | `membershipTerms` plan sentence |
| `lib/types.ts`, `lib/offers.ts` | `installments` on `Offer` / `PriceFields`, through `offerAtPrice` |
| `lib/store.ts`, `lib/admin.ts` | read and write the column; the "cannot reprice a row someone is on" rule |
| `lib/prices-field.ts` | validation |
| `components/admin/offer-price-fields.tsx` | Bills: In instalments, How many |
| `lib/payment-plans-stripe.ts` | server-only: `scheduleInstalments`, `endSubscription`, `releaseSchedule` |
| `lib/checkout.ts` | call `scheduleInstalments` on both subscription paths; `installments` metadata |
| `lib/orders.ts`, `lib/members.ts` | refund ends the schedule; member cancel releases it first |
| `lib/subscription-sync.ts` | `markPlanPaidOff` |
| `app/api/webhooks/stripe/route.ts` | the deleted branch |
| `components/checkout/slots.tsx` | `off each payment` |
| `docs/DATABASE.md`, `docs/products-and-offers.md` | the column and how plans work |

---

### Task 1: Migration

**Files:**
- Create: `supabase/migrations/0085_payment_plans.sql`
- Test: `lib/payment-plans-migration.test.ts`
- Modify: `docs/DATABASE.md` (offer_prices and product_prices column tables)

- [ ] **Step 1: Write the failing test**

```ts
// lib/payment-plans-migration.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

const SQL = readFileSync("supabase/migrations/0085_payment_plans.sql", "utf8");

describe("the payment plans migration", () => {
  it("has a number nothing else has taken", () => {
    const numbers = readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.slice(0, 4));
    expect(numbers.filter((n) => n === "0085")).toHaveLength(1);
  });

  it("adds installments to both price tables with the same rule", () => {
    for (const table of ["offer_prices", "product_prices"]) {
      expect(SQL).toContain(`alter table ${table}\n  add column if not exists installments integer`);
      expect(SQL).toContain(`constraint ${table}_installments_plan`);
    }
    // 2 to 24, recurring only. CHECK constraints are invisible to tsc and
    // vitest, so the rule is pinned here where a reader will see it.
    expect((SQL.match(/installments between 2 and 24 and billing_type = 'recurring'/g) ?? []).length).toBe(2);
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npx vitest run lib/payment-plans-migration.test.ts`
Expected: FAIL, `ENOENT`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0085_payment_plans.sql
--
-- Payment plans: a recurring price that stops after N instalments.
--
-- A plan is not a third billing type. It is a recurring row with
-- `installments` set, so every path that already handles recurring (the
-- SetupIntent, the subscription, dunning, revocation) handles a plan, and
-- only the places that need to know it ends read this column. The schedule
-- that ends it lives in Stripe; see lib/payment-plans-stripe.ts.
--
-- Null everywhere today. Nothing changes for an existing price.

alter table offer_prices
  add column if not exists installments integer;
alter table offer_prices
  add constraint offer_prices_installments_plan
  check (installments is null or (installments between 2 and 24 and billing_type = 'recurring'));

alter table product_prices
  add column if not exists installments integer;
alter table product_prices
  add constraint product_prices_installments_plan
  check (installments is null or (installments between 2 and 24 and billing_type = 'recurring'));

comment on column offer_prices.installments is
  'Set on a recurring row: charge this many times, then stop and keep the grant. Null: an ordinary subscription. Migration 0085.';
comment on column product_prices.installments is
  'Set on a recurring row: charge this many times, then stop and keep the grant. Null: an ordinary subscription. Migration 0085.';

notify pgrst, 'reload schema';
```

- [ ] **Step 4: Run the test, expect pass**

Run: `npx vitest run lib/payment-plans-migration.test.ts`

- [ ] **Step 5: Apply it to the LOCAL database**

```bash
docker exec -i supabase_db_grow_membership psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/0085_payment_plans.sql
docker exec supabase_db_grow_membership psql -U postgres -d postgres -Atc "select table_name from information_schema.columns where column_name='installments' order by 1;"
```
Expected: `offer_prices` and `product_prices`.

- [ ] **Step 6: Document**

In `docs/DATABASE.md`, in both the `offer_prices` and `product_prices` column tables, add:

```
| `installments` | integer | yes |  | Set on a recurring row: charge this many times, then stop and keep the grant. 2 to 24. Null: an ordinary subscription. 0085 |
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0085_payment_plans.sql lib/payment-plans-migration.test.ts docs/DATABASE.md
git commit -m "Add installments to the price tables"
```

---

### Task 2: The price type and every sentence about it

**Files:**
- Create: `lib/payment-plans.ts`, `lib/payment-plans.test.ts`
- Modify: `lib/offer-prices.ts` (`OfferPrice`, `newOfferPrice`, `priceLabel`, `priceTerms`, `chargeNowCents`, `priceSummary`, `savingAgainst`), `lib/offer-terms.ts`, `lib/types.ts:104-114`, `lib/offers.ts:141-161`, `lib/store.ts:25,69`, `lib/admin.ts:114`
- Test: `lib/offer-prices.test.ts` (extend), `lib/offer-terms.test.ts` (extend or create)

**Interfaces:**
- Produces:
  - `OfferPrice.installments: number | null` (default null in `newOfferPrice`).
  - `Offer.installments: number | null`; `offerAtPrice` copies it.
  - `lib/payment-plans.ts`: `isPlan(p: { billingType: string; installments?: number | null }): boolean`; `planSentence(p: { installments: number; interval: string | null; intervalCount: number; trialDays: number | null }, amount: string, trialDays?: number | null): string`; `planOutcome(installments: number, paidInvoices: number): "paid_off" | "canceled"`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/payment-plans.test.ts
import { describe, it, expect } from "vitest";
import { isPlan, planSentence, planOutcome } from "@/lib/payment-plans";

describe("what a plan is", () => {
  it("is a recurring price with instalments, and nothing else", () => {
    expect(isPlan({ billingType: "recurring", installments: 3 })).toBe(true);
    expect(isPlan({ billingType: "recurring", installments: null })).toBe(false);
    expect(isPlan({ billingType: "one_time", installments: null })).toBe(false);
    expect(isPlan({ billingType: "recurring" })).toBe(false);
  });
});

describe("what a plan says", () => {
  const monthly = { installments: 3, interval: "month", intervalCount: 1, trialDays: null };
  it("counts the payments and says when it is theirs", () => {
    expect(planSentence(monthly, "$199")).toBe("3 monthly payments of $199, then it's yours");
  });
  it("puts a trial in front", () => {
    expect(planSentence({ ...monthly, trialDays: 7 }, "$199")).toBe(
      "7 days free, then 3 monthly payments of $199, then it's yours",
    );
  });
  it("lets a coupon replace the trial, including taking it away", () => {
    expect(planSentence({ ...monthly, trialDays: 7 }, "$199", 30)).toContain("30 days free");
    expect(planSentence({ ...monthly, trialDays: 7 }, "$199", 0)).toBe("3 monthly payments of $199, then it's yours");
  });
  it("says the interval when it is not one month", () => {
    expect(planSentence({ ...monthly, intervalCount: 2 }, "$199")).toBe(
      "3 payments of $199 every 2 months, then it's yours",
    );
    expect(planSentence({ ...monthly, interval: "week" }, "$50")).toBe(
      "3 weekly payments of $50, then it's yours",
    );
  });
});

describe("what the end of a plan means", () => {
  it("is paid off only once every instalment is paid", () => {
    expect(planOutcome(3, 3)).toBe("paid_off");
    expect(planOutcome(3, 4)).toBe("paid_off");
    expect(planOutcome(3, 2)).toBe("canceled");
    expect(planOutcome(3, 0)).toBe("canceled");
  });
});
```

Append to `lib/offer-prices.test.ts`:

```ts
describe("a payment plan", () => {
  const plan: OfferPrice = {
    ...newOfferPrice("plan"),
    billingType: "recurring",
    interval: "month",
    intervalCount: 1,
    installments: 3,
    priceCents: 19900,
  };
  const once: OfferPrice = { ...newOfferPrice("once"), priceCents: 49700 };
  const monthly: OfferPrice = { ...newOfferPrice("mo"), billingType: "recurring", interval: "month", priceCents: 2900 };

  it("labels the count, not a term", () => {
    expect(priceLabel(plan, "usd")).toBe("3 × $199");
  });
  it("says the whole arrangement in the terms", () => {
    expect(priceTerms(plan, "usd")).toBe("3 monthly payments of $199, then it's yours");
    expect(priceTerms({ ...plan, trialDays: 7 }, "usd")).toBe("7 days free, then 3 monthly payments of $199, then it's yours");
    expect(priceTerms({ ...plan, trialDays: 7 }, "usd", 0)).toBe("3 monthly payments of $199, then it's yours");
  });
  it("charges the first instalment today, or nothing through a trial", () => {
    expect(chargeNowCents(plan)).toBe(19900);
    expect(chargeNowCents({ ...plan, trialDays: 7 })).toBe(0);
  });
  it("summarises with the total, so the admin sees what the plan really costs", () => {
    expect(priceSummary(plan, "usd")).toBe("3 × $199 monthly ($597 total)");
    expect(priceSummary({ ...plan, interval: "month", intervalCount: 2 }, "usd")).toBe("3 × $199 every 2 months ($597 total)");
  });
  it("is never a saving and never saved against", () => {
    expect(savingAgainst(monthly, plan)).toBeNull();
    expect(savingAgainst(plan, monthly)).toBeNull();
    expect(savingAgainst(once, plan)).toBeNull();
  });
  it("starts null on a new price", () => {
    expect(newOfferPrice("x").installments).toBeNull();
  });
});
```

(Add `chargeNowCents`, `priceSummary`, `savingAgainst`, `newOfferPrice` to that file's import from `@/lib/offer-prices` if missing.)

Create or extend `lib/offer-terms.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { membershipTerms } from "@/lib/offer-terms";

describe("membership terms on a plan", () => {
  it("says the plan sentence with no per-interval suffix", () => {
    const r = membershipTerms(
      { billingType: "recurring", interval: "month", intervalCount: 1, trialDays: null, installments: 3 },
      "$199",
    );
    expect(r).toEqual({ suffix: " × 3", terms: "3 monthly payments of $199, then it's yours" });
  });
  it("leaves an ordinary subscription alone", () => {
    const r = membershipTerms({ billingType: "recurring", interval: "month", intervalCount: 1, trialDays: null, installments: null }, "$29");
    expect(r.suffix).toBe("/month");
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run lib/payment-plans.test.ts lib/offer-prices.test.ts lib/offer-terms.test.ts`

- [ ] **Step 3: Implement**

```ts
// lib/payment-plans.ts
/**
 * A payment plan: a recurring price that charges a fixed number of times and
 * then stops, the buyer keeping what they bought.
 *
 * Pure. The Stripe half lives in lib/payment-plans-stripe.ts, the webhook
 * half in lib/subscription-sync.ts; this is the part both can be tested
 * against without either.
 */

export function isPlan(p: { billingType: string; installments?: number | null }): boolean {
  return p.billingType === "recurring" && typeof p.installments === "number" && p.installments >= 2;
}

/** "monthly", "weekly", "every 2 months". */
function cadence(interval: string | null, intervalCount: number): { adverb: string | null; every: string } {
  const unit = interval ?? "month";
  const n = Math.max(1, Math.round(intervalCount || 1));
  if (n === 1 && unit === "month") return { adverb: "monthly", every: "every month" };
  if (n === 1 && unit === "week") return { adverb: "weekly", every: "every week" };
  if (n === 1 && unit === "year") return { adverb: "yearly", every: "every year" };
  if (n === 1 && unit === "day") return { adverb: "daily", every: "every day" };
  return { adverb: null, every: `every ${n} ${unit}s` };
}

/**
 * The whole arrangement in one line. `couponTrialDays` replaces the price's
 * own trial the way priceTerms does: null means no code, zero means a code
 * took the trial away.
 */
export function planSentence(
  p: { installments: number; interval: string | null; intervalCount: number; trialDays: number | null },
  amount: string,
  couponTrialDays: number | null = null,
): string {
  const { adverb, every } = cadence(p.interval, p.intervalCount);
  const body = adverb
    ? `${p.installments} ${adverb} payments of ${amount}, then it's yours`
    : `${p.installments} payments of ${amount} ${every}, then it's yours`;
  const trial = couponTrialDays ?? p.trialDays;
  return trial && trial > 0 ? `${trial} days free, then ${body}` : body;
}

/**
 * What a subscription ending means for a plan.
 *
 * Counted, not trusted: a schedule Stripe ended early after failed retries
 * emits the same deleted event as one that ran its course.
 */
export function planOutcome(installments: number, paidInvoices: number): "paid_off" | "canceled" {
  return paidInvoices >= installments ? "paid_off" : "canceled";
}
```

`lib/offer-prices.ts`:
- `OfferPrice` gains `/** Set: charge this many times, then stop. A payment plan. */ installments: number | null;` after `trialDays`.
- `newOfferPrice` returns `installments: null`.
- Import `import { isPlan, planSentence } from "@/lib/payment-plans";`.
- `priceLabel`: before the recurring line, `if (isPlan(price)) return \`${price.installments} × ${amount}\`;`.
- `priceTerms`: after the `!== "recurring"` return, `if (isPlan(price)) return planSentence({ ...price, installments: price.installments! }, money(price.priceCents, currency), couponTrialDays);`.
- `chargeNowCents`: unchanged (a plan is recurring: trial gives 0, else the instalment).
- `priceSummary`: before the existing `terms` line:
  ```ts
  if (isPlan(price)) {
    const n = price.installments!;
    const { adverb, every } = cadenceWords(price);
    return `${head}${n} × ${money(price.priceCents, currency)} ${adverb ?? every} (${money(price.priceCents * n, currency)} total)`;
  }
  ```
  where `cadenceWords` is exported from `lib/payment-plans.ts` as `export function cadenceWords(p: { interval: string | null; intervalCount: number })` returning the same `{ adverb, every }` as the private `cadence` (export that function under the name `cadenceWords` and use it in `planSentence` too; one function).
- `savingAgainst`: first line `if (isPlan(base) || isPlan(other)) return null;`.

`lib/offer-terms.ts`:
```ts
import { isPlan, planSentence } from "@/lib/payment-plans";
export function membershipTerms(
  offer: { billingType: BillingType; interval: Interval | null; intervalCount?: number | null; trialDays: number | null; installments?: number | null },
  price: string,
): { suffix: string | null; terms: string } {
  if (isPlan(offer)) {
    return {
      suffix: ` × ${offer.installments}`,
      terms: planSentence(
        { installments: offer.installments!, interval: offer.interval, intervalCount: offer.intervalCount ?? 1, trialDays: offer.trialDays },
        price,
      ),
    };
  }
  // existing body unchanged below
```

`lib/types.ts` `Offer`: add `installments: number | null;` after `trialDays`. `lib/offers.ts` `PriceFields`: add `installments?: number | null;` and in `offerAtPrice` add `installments: price.installments,`. `hydrateOffer` in `lib/store.ts` and the offer read in `lib/admin.ts`: the offer-level column does not exist (plans live on price rows), so set `installments: null` on the hydrated offer where `intervalCount` is set, and add `installments` to the three price column strings: `lib/store.ts:25`, `lib/store.ts:69`, `lib/admin.ts:114` (`..., trial_days, installments, price_cents, ...`).

- [ ] **Step 4: Run, typecheck**

Run: `npx vitest run lib/payment-plans.test.ts lib/offer-prices.test.ts lib/offer-terms.test.ts && npx tsc --noEmit`
Fix every place tsc names that builds an `OfferPrice` or `Offer` literal without `installments` (tests and fixtures included) by adding `installments: null`.

- [ ] **Step 5: Full suite, commit**

```bash
npx vitest run; echo exit=$?
git add lib/payment-plans.ts lib/payment-plans.test.ts lib/offer-prices.ts lib/offer-prices.test.ts lib/offer-terms.ts lib/offer-terms.test.ts lib/types.ts lib/offers.ts lib/store.ts lib/admin.ts
git commit -m "A plan is a recurring price with instalments, and every sentence says so"
```
(Add any fixture files tsc made you touch.)

---

### Task 3: Validation, saving, and the price editor

**Files:**
- Modify: `lib/prices-field.ts:24-50`, `lib/admin.ts:455-510` (`savePrices`), `components/admin/offer-price-fields.tsx:170-245`
- Test: `components/admin/offer-price-fields.test.tsx` (extend), `lib/prices-field.test.ts` (create)

**Interfaces:**
- Consumes: `OfferPrice.installments` (Task 2).
- Produces: `pricesField` accepts `installments: number | null` (2 to 24, recurring only); `savePrices` writes `installments` and treats a change to it as a repricing.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/prices-field.test.ts
import { describe, it, expect } from "vitest";
import { pricesField } from "@/lib/prices-field";

const base = { id: "p", label: "", billingType: "recurring", interval: "month", intervalCount: 1, trialDays: null, priceCents: 19900, compareAtCents: null, archived: false };
const parse = (over: Record<string, unknown>) => pricesField.safeParse(JSON.stringify([{ ...base, ...over }]));

describe("a plan through the save", () => {
  it("keeps the count", () => {
    const r = parse({ installments: 3 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data[0].installments).toBe(3);
  });
  it("defaults to none", () => {
    const r = parse({});
    expect(r.success && r.data[0].installments).toBeNull();
  });
  it("refuses fewer than 2 or more than 24", () => {
    expect(parse({ installments: 1 }).success).toBe(false);
    expect(parse({ installments: 25 }).success).toBe(false);
  });
  it("refuses a plan on a one-off", () => {
    expect(parse({ billingType: "one_time", interval: null, installments: 3 }).success).toBe(false);
  });
  it("lets a plan carry a trial", () => {
    expect(parse({ installments: 3, trialDays: 7 }).success).toBe(true);
  });
});
```

Append to `components/admin/offer-price-fields.test.tsx` inside its describe (reuse its mount pattern):

```ts
  it("offers instalments under Bills and shows How many", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<OfferPriceFields prices={[newOfferPrice("p1")]} currency="usd" name="prices" />));
    const bills = host.querySelector<HTMLSelectElement>('select[aria-label="Bills"]')!;
    expect([...bills.options].map((o) => o.textContent)).toContain("In instalments");
    act(() => {
      bills.value = "plan";
      bills.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const count = host.querySelector<HTMLInputElement>('input[aria-label="How many"]')!;
    expect(count.value).toBe("3");
    const posted = JSON.parse(host.querySelector<HTMLInputElement>('input[name="prices"]')!.value);
    expect(posted[0]).toMatchObject({ billingType: "recurring", interval: "month", installments: 3 });
    act(() => {
      bills.value = "one_time";
      bills.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(JSON.parse(host.querySelector<HTMLInputElement>('input[name="prices"]')!.value)[0].installments).toBeNull();
    act(() => root.unmount());
  });
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run lib/prices-field.test.ts components/admin/offer-price-fields.test.tsx`

- [ ] **Step 3: Implement**

`lib/prices-field.ts`: add `installments: z.coerce.number().int().min(2).max(24).nullable().default(null),` after `trialDays`, and a refine:
```ts
          .refine((p) => p.installments === null || p.billingType === "recurring", {
            message: "A payment plan is a recurring price",
          })
```

`lib/admin.ts` `savePrices`: select `installments` in the existing-rows read; add `installments: p.billingType === "recurring" ? p.installments : null,` to `row`; add `was.installments !== row.installments ||` to `moved`.

`components/admin/offer-price-fields.tsx`, the Bills select:
```tsx
                  <select
                    aria-label="Bills"
                    className={inputClass}
                    value={
                      p.billingType === "one_time" ? "one_time" : p.installments ? "plan" : (p.interval ?? "month")
                    }
                    onChange={(e) =>
                      edit(
                        i,
                        e.target.value === "one_time"
                          ? { billingType: "one_time", interval: null, trialDays: null, installments: null }
                          : e.target.value === "plan"
                            ? // A plan: monthly by default, three payments, the
                              // interval still editable beside it.
                              { billingType: "recurring", interval: p.interval ?? "month", installments: p.installments ?? 3 }
                            : { billingType: "recurring", interval: e.target.value as OfferPrice["interval"], installments: null },
                      )
                    }
                  >
                    <option value="one_time">Once</option>
                    {INTERVALS.map((iv) => (
                      <option key={iv} value={iv}>
                        Every {iv}
                      </option>
                    ))}
                    <option value="plan">In instalments</option>
                  </select>
```
After the Bills label, add:
```tsx
                {p.installments !== null && (
                  <label className="flex flex-col gap-1 text-[0.68rem] text-muted">
                    How many
                    <input
                      aria-label="How many"
                      type="number"
                      min={2}
                      max={24}
                      className={inputClass}
                      value={p.installments}
                      onChange={(e) => edit(i, { installments: Math.min(24, Math.max(2, Number(e.target.value) || 2)) })}
                    />
                  </label>
                )}
```
For a plan the "Every" control should show the interval unit too, since the Bills dropdown no longer names it: change the `Every` input's label to `{p.installments ? \`Every (${p.interval ?? "month"}s)\` : "Every"}`. The trial field stays as it is (enabled for any recurring row).

- [ ] **Step 4: Run, typecheck, full suite, commit**

```bash
npx vitest run lib/prices-field.test.ts components/admin/offer-price-fields.test.tsx && npx tsc --noEmit && npx vitest run; echo exit=$?
git add lib/prices-field.ts lib/prices-field.test.ts lib/admin.ts components/admin/offer-price-fields.tsx components/admin/offer-price-fields.test.tsx
git commit -m "Admin: a way to pay can be In instalments"
```

---

### Task 4: Stripe: the schedule, and ending one

**Files:**
- Create: `lib/payment-plans-stripe.ts`
- Modify: `lib/checkout.ts:838-880` (offer path) and `:1156-1197` (product path), `lib/orders.ts:147-200` (`refundOrder`), `lib/members.ts:82-84` (`cancelSubscription`)
- Test: `lib/payment-plans-stripe.test.ts` (unit, fake Stripe)

**Interfaces:**
- Produces (server-only):
  - `scheduleInstalments(sub: { id: string; trial_end: number | null; items: { data: { price: { id: string } }[] } }, installments: number): Promise<string>` returns the schedule id.
  - `endSubscription(subscriptionId: string): Promise<void>`: cancels the schedule when the subscription has one, else cancels the subscription.
  - `releaseSchedule(subscriptionId: string): Promise<void>`: releases the schedule if present so `cancel_at_period_end` can be set.
- Consumes: `isPlan` (Task 2), `offer.installments` via `offerAtPrice`, `price.installments` on the product path.

- [ ] **Step 1: Write the failing test**

```ts
// lib/payment-plans-stripe.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn(async () => ({ id: "sub_sched_1", phases: [{ start_date: 1000 }] }));
const update = vi.fn(async () => ({ id: "sub_sched_1" }));
const scheduleCancel = vi.fn(async () => ({}));
const release = vi.fn(async () => ({}));
const subCancel = vi.fn(async () => ({}));
const retrieve = vi.fn(async (id: string) => ({ id, schedule: id === "sub_planned" ? "sub_sched_1" : null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/stripe", () => ({
  stripe: () => ({
    subscriptionSchedules: { create, update, cancel: scheduleCancel, release },
    subscriptions: { cancel: subCancel, retrieve },
  }),
}));

const { scheduleInstalments, endSubscription, releaseSchedule } = await import("@/lib/payment-plans-stripe");

const sub = (trialEnd: number | null) => ({ id: "sub_1", trial_end: trialEnd, items: { data: [{ price: { id: "price_1" } }] } });

describe("scheduling instalments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("wraps the subscription and ends it after N iterations", async () => {
    await scheduleInstalments(sub(null), 3);
    expect(create).toHaveBeenCalledWith({ from_subscription: "sub_1" }, { idempotencyKey: "plan_sub_1" });
    const [, body] = update.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(body.end_behavior).toBe("cancel");
    expect(body.phases).toEqual([{ items: [{ price: "price_1", quantity: 1 }], iterations: 3 }]);
  });

  it("gives a trial its own phase, so the billing phase still counts N", async () => {
    await scheduleInstalments(sub(2000), 3);
    const [, body] = update.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(body.phases).toEqual([
      { items: [{ price: "price_1", quantity: 1 }], trial: true, end_date: 2000 },
      { items: [{ price: "price_1", quantity: 1 }], iterations: 3 },
    ]);
  });
});

describe("ending a subscription", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cancels the schedule when there is one, which cancels the subscription", async () => {
    await endSubscription("sub_planned");
    expect(scheduleCancel).toHaveBeenCalledWith("sub_sched_1");
    expect(subCancel).not.toHaveBeenCalled();
  });
  it("cancels the subscription directly otherwise", async () => {
    await endSubscription("sub_plain");
    expect(subCancel).toHaveBeenCalledWith("sub_plain");
    expect(scheduleCancel).not.toHaveBeenCalled();
  });
  it("releases the schedule before a period-end cancel, and does nothing without one", async () => {
    await releaseSchedule("sub_planned");
    expect(release).toHaveBeenCalledWith("sub_sched_1");
    await releaseSchedule("sub_plain");
    expect(release).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run lib/payment-plans-stripe.test.ts`

- [ ] **Step 3: Implement**

```ts
// lib/payment-plans-stripe.ts
import "server-only";
import { stripe } from "@/lib/stripe";

/**
 * The Stripe half of a payment plan.
 *
 * A plan is an ordinary subscription plus a schedule that ends it after N
 * invoices. The schedule is what makes "3 payments" mean three: iterations
 * count billing periods, where a cancel_at date is arithmetic a delayed
 * retry can land on the wrong side of.
 */

type SubLike = { id: string; trial_end: number | null; items: { data: { price: { id: string } }[] } };

/**
 * Wrap a just-created subscription in a schedule of exactly N invoices.
 *
 * A trial gets its own phase. Inside the billing phase it would eat into the
 * iterations, and "7 days free then 3 payments" would bill twice.
 * Idempotent on the subscription: the thank-you page and the webhook race
 * to fulfil, and one schedule is the right number.
 */
export async function scheduleInstalments(sub: SubLike, installments: number): Promise<string> {
  const s = stripe();
  const schedule = await s.subscriptionSchedules.create(
    { from_subscription: sub.id },
    { idempotencyKey: `plan_${sub.id}` },
  );
  const items = [{ price: sub.items.data[0].price.id, quantity: 1 }];
  const billing = { items, iterations: installments };
  const phases = sub.trial_end ? [{ items, trial: true, end_date: sub.trial_end }, billing] : [billing];
  await s.subscriptionSchedules.update(schedule.id, { end_behavior: "cancel", phases });
  return schedule.id;
}

/** The schedule managing a subscription, or null. */
async function scheduleOf(subscriptionId: string): Promise<string | null> {
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const sched = (sub as { schedule?: string | { id: string } | null }).schedule;
  return typeof sched === "string" ? sched : (sched?.id ?? null);
}

/**
 * End it now. Stripe refuses to cancel a subscription a schedule manages,
 * so the schedule is what gets cancelled, and the subscription goes with it.
 */
export async function endSubscription(subscriptionId: string): Promise<void> {
  const sched = await scheduleOf(subscriptionId);
  if (sched) await stripe().subscriptionSchedules.cancel(sched);
  else await stripe().subscriptions.cancel(subscriptionId);
}

/**
 * Hand the subscription back to itself so cancel_at_period_end can be set.
 * Releasing keeps the subscription running; it only stops the schedule
 * driving it, so the member's own cancel behaves as it does for any
 * subscription: they keep what they paid for until the period ends.
 */
export async function releaseSchedule(subscriptionId: string): Promise<void> {
  const sched = await scheduleOf(subscriptionId);
  if (sched) await stripe().subscriptionSchedules.release(sched);
}
```

If the installed Stripe types reject `phases[].trial` or `end_date`, cast the update body `as never` with a one-line comment naming the API version; do not drop the phase.

`lib/checkout.ts`, offer path (after `subscriptions.create` at ~838 and before `noteTrial`):
```ts
    // A plan: the schedule is what stops it after N. Metadata says so, for
    // the webhook that decides between "paid off" and "cancelled".
    if (isPlan(offer)) await scheduleInstalments(sub, offer.installments!);
```
and add `...(isPlan(offer) ? { installments: String(offer.installments) } : {}),` to that subscription's `metadata`. Product path (~1156): the same two edits using `price` (`isPlan(price)`, `price.installments`). Import `isPlan` from `@/lib/payment-plans` and `scheduleInstalments` from `@/lib/payment-plans-stripe`.

`lib/orders.ts` `refundOrder`: after the Stripe refund succeeds and before revocation, end every subscription the order's items started:
```ts
  // A refunded subscription must stop billing. For a plan that means its
  // schedule; for anything else, the subscription itself.
  const { data: subs } = await db
    .from("order_items")
    .select("stripe_subscription_id")
    .eq("order_id", orderId)
    .not("stripe_subscription_id", "is", null);
  for (const row of subs ?? []) {
    try {
      await endSubscription(row.stripe_subscription_id as string);
    } catch (e) {
      console.error("[refundOrder] could not end subscription:", e);
    }
  }
```
Read `refundOrder` fully first and place this after the refund call and before `revokeOwnershipForOrder`; swallow errors so a subscription already ended does not fail a refund that went through.

`lib/members.ts` `cancelSubscription`: `await releaseSchedule(subscriptionId);` before the `cancel_at_period_end` update.

- [ ] **Step 4: Run, typecheck, full suite, commit**

```bash
npx vitest run lib/payment-plans-stripe.test.ts && npx tsc --noEmit && npx vitest run; echo exit=$?
git add lib/payment-plans-stripe.ts lib/payment-plans-stripe.test.ts lib/checkout.ts lib/orders.ts lib/members.ts
git commit -m "Stripe: a plan is a subscription with a schedule of N invoices"
```

---

### Task 5: The way out

**Files:**
- Modify: `lib/subscription-sync.ts` (add `markPlanPaidOff`), `app/api/webhooks/stripe/route.ts:72-77`
- Test: `lib/plan-paid-off.integration.test.ts` (create), `app/api/webhooks/stripe/route.test.ts` (extend)

**Interfaces:**
- Produces: `markPlanPaidOff(stripeSubscriptionId: string): Promise<{ paidOff: number }>`.
- Consumes: `planOutcome` (Task 2), `syncSubscriptionOwnership`, `pushOwnershipStateToApps`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/plan-paid-off.integration.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { markPlanPaidOff } from "@/lib/subscription-sync";
import { ownershipFor } from "@/lib/checkout";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const PRODUCT = "00000000-0000-0000-0000-0000000000b1";
let userId = "";

describe.skipIf(!canRun)("a plan paid off (integration)", () => {
  it("keeps ownership and forgets the subscription", async () => {
    const db = createServiceClient();
    userId = crypto.randomUUID();
    await db.from("users").insert({ id: userId, store_id: await getStoreId(), email: `zz-plan-${userId}@example.test` });
    const { error } = await db.from("ownership").insert({
      store_id: await getStoreId(), user_id: userId, product_id: PRODUCT, source: "purchase",
      status: "past_due", stripe_subscription_id: "sub_zz_plan",
    });
    if (error) throw new Error(error.message);

    expect(await markPlanPaidOff("sub_zz_plan")).toEqual({ paidOff: 1 });
    const { data } = await db.from("ownership").select("status, stripe_subscription_id").eq("user_id", userId).order("id");
    expect(data).toEqual([{ status: "active", stripe_subscription_id: null }]);
    expect((await ownershipFor(userId)).productIds.has(PRODUCT)).toBe(true);
    // A second delivery of the event finds nothing to do.
    expect(await markPlanPaidOff("sub_zz_plan")).toEqual({ paidOff: 0 });
  });
});

afterAll(async () => {
  if (!canRun || !userId) return;
  const db = createServiceClient();
  await db.from("ownership").delete().eq("user_id", userId);
  await db.from("users").delete().eq("id", userId);
});
```

Read `lib/checkout.ts` `ownershipFor`'s return shape and the seeded product id used by other integration tests (grep `0000000000b1` or the product fixture other suites use) and adjust `PRODUCT` to a real seeded product id.

Extend `app/api/webhooks/stripe/route.test.ts`: add mocks for `@/lib/subscription-sync` (`syncSubscriptionOwnership`, `markPlanPaidOff`, `revokeOwnershipForPaymentIntent` as `vi.fn`) and extend the `@/lib/stripe` mock with `invoices: { list: invoicesList }` where `invoicesList = vi.fn()`. Then:

```ts
describe("customer.subscription.deleted on a plan", () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    syncSubscriptionOwnership.mockClear();
    markPlanPaidOff.mockClear();
    invoicesList.mockReset();
  });
  const deleted = (installments?: string) => {
    fakeEvent = { type: "customer.subscription.deleted", data: { object: { id: "sub_p", metadata: installments ? { installments } : {} } } };
  };
  const invoices = (paid: number[]) => invoicesList.mockResolvedValue({ data: paid.map((amount_paid) => ({ status: "paid", amount_paid })) });

  it("pays off after every instalment is paid", async () => {
    deleted("3"); invoices([19900, 19900, 19900]);
    await post();
    expect(markPlanPaidOff).toHaveBeenCalledWith("sub_p");
    expect(syncSubscriptionOwnership).not.toHaveBeenCalled();
  });
  it("cancels when Stripe gave up early", async () => {
    deleted("3"); invoices([19900, 19900]);
    await post();
    expect(syncSubscriptionOwnership).toHaveBeenCalledWith("sub_p", "canceled");
    expect(markPlanPaidOff).not.toHaveBeenCalled();
  });
  it("does not count the trial's $0 invoice", async () => {
    deleted("3"); invoices([0, 19900, 19900]);
    await post();
    expect(syncSubscriptionOwnership).toHaveBeenCalledWith("sub_p", "canceled");
  });
  it("treats a subscription with no instalments as it always did", async () => {
    deleted(); await post();
    expect(syncSubscriptionOwnership).toHaveBeenCalledWith("sub_p", "canceled");
    expect(invoicesList).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run lib/plan-paid-off.integration.test.ts app/api/webhooks/stripe/route.test.ts`

- [ ] **Step 3: Implement**

`lib/subscription-sync.ts`:
```ts
/**
 * A plan ran its course: every instalment is paid, so the buyer owns it.
 *
 * The row keeps its status and loses its subscription id, which is what
 * makes it read as a plain purchase everywhere from now on: ownershipFor,
 * the library, the reconciler (which skips rows with no subscription) and
 * the connected apps, which are pushed here so they stop waiting on a
 * subscription that no longer exists. A second call matches nothing.
 */
export async function markPlanPaidOff(stripeSubscriptionId: string): Promise<{ paidOff: number }> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("ownership")
    .update({ status: "active", stripe_subscription_id: null })
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .select("id");
  if (error) throw new Error(`markPlanPaidOff: ${error.message}`);
  const ids = (data ?? []).map((r) => r.id as string);
  if (ids.length > 0) await pushOwnershipStateToApps(ids);
  return { paidOff: ids.length };
}
```

`app/api/webhooks/stripe/route.ts`, the deleted/updated case:
```ts
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      // A plan that ended is either paid off or given up on, and the event
      // looks the same either way. The invoices know which.
      const installments = Number(sub.metadata?.installments ?? 0);
      if (event.type === "customer.subscription.deleted" && installments >= 2) {
        const invoices = await stripe().invoices.list({ subscription: sub.id, status: "paid", limit: 100 });
        const paid = invoices.data.filter((i) => (i.amount_paid ?? 0) > 0).length;
        if (planOutcome(installments, paid) === "paid_off") {
          await markPlanPaidOff(sub.id);
          break;
        }
      }
      const status = event.type === "customer.subscription.deleted" ? "canceled" : sub.status;
      await syncSubscriptionOwnership(sub.id, status);
      break;
    }
```
Import `planOutcome` from `@/lib/payment-plans` and `markPlanPaidOff` alongside `syncSubscriptionOwnership`.

- [ ] **Step 4: Run, typecheck, full suite, commit**

```bash
npx vitest run lib/plan-paid-off.integration.test.ts app/api/webhooks/stripe/route.test.ts && npx tsc --noEmit && npx vitest run; echo exit=$?
git add lib/subscription-sync.ts lib/plan-paid-off.integration.test.ts app/api/webhooks/stripe/route.ts app/api/webhooks/stripe/route.test.ts
git commit -m "A plan that paid every instalment keeps what it bought"
```

---

### Task 6: Checkout copy and the end-to-end proof

**Files:**
- Modify: `components/checkout/slots.tsx:575-585` (the applied coupon line)
- Test: `lib/payment-plan.integration.test.ts` (create, Stripe test mode), `components/checkout/offer-checkout-v2.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `components/checkout/offer-checkout-v2.test.tsx` (its fixtures already build `OfferPrice`s; add `installments: null` to `price()` and:

```ts
  it("says a plan the way the sales page does, and says a coupon is off each payment", () => {
    const plan = price({ id: "plan", installments: 3, priceCents: 19900 });
    const el = render(
      <OfferCheckoutForm offer={offer} signedInEmail="m@e.com" publishableKey="pk" prices={[plan]} chosen={0} skin="v2" />,
    );
    expect(el.textContent).toContain("3 monthly payments of $199, then it's yours");
    expect(el.textContent).toContain("3 × $199");
  });
```
(The "off each payment" half needs an applied coupon in state, which this form gets from a server action; assert it by source instead: `readFileSync("components/checkout/slots.tsx")` contains `off each payment` and `isPlan(`.)

```ts
// lib/payment-plan.integration.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { startOfferCheckout, completeOfferCheckout } from "@/lib/offer-checkout";
import { refundOrder } from "@/lib/orders";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

const canRun = !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "00000000-0000-0000-0000-0000000000a1";
const made = { users: [] as string[], offers: [] as string[] };

async function planOffer(trialDays: number | null) {
  const db = createServiceClient();
  const id = crypto.randomUUID();
  made.offers.push(id);
  const { error } = await db.from("offers").insert({
    id, store_id: await getStoreId(), key: `zz-plan-${id}`, name: "zz plan offer", grant_type: "subscription",
    grant_app_id: APP, grant_entitlement_key: "content-engine", billing_type: "recurring", interval: "month",
    interval_count: 1, trial_days: trialDays, price_cents: 100, currency: "usd", headline: "zz", description: "zz",
  });
  if (error) throw new Error(error.message);
  const { error: pe } = await db.from("offer_prices").insert({
    offer_id: id, billing_type: "recurring", interval: "month", interval_count: 1, trial_days: trialDays,
    price_cents: 100, installments: 3, sort_order: 0,
  });
  if (pe) throw new Error(pe.message);
  return id;
}

async function member() {
  const db = createServiceClient();
  const email = `zz-plan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const created = await db.auth.admin.createUser({ email, password: "password12345", email_confirm: true });
  if (created.error || !created.data.user) throw new Error(created.error?.message);
  const userId = created.data.user.id;
  made.users.push(userId);
  await db.from("users").insert({ id: userId, store_id: await getStoreId(), email, username: "zz" });
  return { userId, email };
}

async function buy(offerId: string, userId: string, email: string) {
  const start = await startOfferCheckout({ userId, email, offerId });
  if (!start.ok) throw new Error(start.error);
  const siId = start.clientSecret.split("_secret_")[0];
  await stripe().setupIntents.confirm(siId, { payment_method: "pm_card_visa", return_url: "http://localhost:3000/x" });
  const done = await completeOfferCheckout(siId);
  if (!done.ok || !("orderId" in done)) throw new Error("checkout did not complete");
  return done.orderId as string;
}

describe.skipIf(!canRun)("a payment plan, end to end (Stripe test mode)", () => {
  it("creates a subscription with a schedule of three invoices, and a refund ends it", async () => {
    const offerId = await planOffer(null);
    const { userId, email } = await member();
    const orderId = await buy(offerId, userId, email);

    const db = createServiceClient();
    const { data: own } = await db.from("ownership").select("status, stripe_subscription_id").eq("user_id", userId).order("id");
    expect(own).toHaveLength(1);
    expect(own![0].status).toBe("active");
    const subId = own![0].stripe_subscription_id as string;

    const sub = await stripe().subscriptions.retrieve(subId);
    expect(sub.metadata.installments).toBe("3");
    const schedId = typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
    expect(schedId).toBeTruthy();
    const sched = await stripe().subscriptionSchedules.retrieve(schedId!);
    expect(sched.end_behavior).toBe("cancel");
    expect(sched.phases.map((p) => p.iterations ?? null)).toEqual([3]);

    const refund = await refundOrder(orderId);
    expect(refund.ok).toBe(true);
    expect((await stripe().subscriptionSchedules.retrieve(schedId!)).status).toBe("canceled");
    expect((await stripe().subscriptions.retrieve(subId)).status).toBe("canceled");
  });

  it("gives a trial its own phase ahead of the three", async () => {
    const offerId = await planOffer(7);
    const { userId, email } = await member();
    await buy(offerId, userId, email);
    const db = createServiceClient();
    const { data: own } = await db.from("ownership").select("stripe_subscription_id").eq("user_id", userId).order("id");
    const sub = await stripe().subscriptions.retrieve(own![0].stripe_subscription_id as string);
    const schedId = typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
    const sched = await stripe().subscriptionSchedules.retrieve(schedId!);
    expect(sched.phases).toHaveLength(2);
    expect(sched.phases[0].trial_end).toBe(sub.trial_end);
    expect(sched.phases[1].iterations).toBe(3);
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const u of made.users) {
    await db.from("ownership").delete().eq("user_id", u);
    await db.from("order_items").delete().in("order_id", (await db.from("orders").select("id").eq("user_id", u)).data?.map((o) => o.id) ?? []);
    await db.from("orders").delete().eq("user_id", u);
    await db.from("users").delete().eq("id", u);
    await db.auth.admin.deleteUser(u);
  }
  for (const o of made.offers) {
    await db.from("offer_prices").delete().eq("offer_id", o);
    await db.from("offers").delete().eq("id", o);
  }
});
```

Read `lib/offer-checkout.integration.test.ts` and `lib/product-recurring.integration.test.ts` for the exact insert shapes they use (columns, the seeded app id, how `startOfferCheckout` returns) and align the fixture to them; the `afterAll` FK order above (ownership, order_items, orders, users, auth) is the one to keep.

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run components/checkout/offer-checkout-v2.test.tsx lib/payment-plan.integration.test.ts`
Expected: the copy test fails on "off each payment" (source assertion); the integration test either fails on `sched` or is skipped without a test key (then it must fail once the key is present).

- [ ] **Step 3: Implement**

`components/checkout/slots.tsx`, the applied coupon line (around `{c.coupon.label}`): read the chosen price via `c.prices[c.pricePick ?? -1]` and append:
```tsx
                {c.coupon.label}
                {c.pricePick !== null && isPlan(c.prices[c.pricePick]) && (
                  <span className="text-muted"> off each payment</span>
                )}
```
Import `isPlan` from `@/lib/payment-plans`.

- [ ] **Step 4: Run, typecheck, full suite, lint, build, commit**

```bash
npx vitest run components/checkout/offer-checkout-v2.test.tsx lib/payment-plan.integration.test.ts && npx tsc --noEmit && npx vitest run; echo exit=$?
npx eslint . 2>&1 | tail -2
npx next build > /dev/null 2>&1; echo build=$?
git add components/checkout/slots.tsx components/checkout/offer-checkout-v2.test.tsx lib/payment-plan.integration.test.ts
git commit -m "Checkout says the plan, and the plan is proven end to end in test mode"
```

---

### Task 7: Docs

**Files:**
- Modify: `docs/products-and-offers.md` (prices section), `docs/lessons.md` (append)

- [ ] **Step 1: Write**

In `docs/products-and-offers.md`, under the ways-to-pay section, add:

```markdown
### Payment plans

A plan is a recurring price with `installments` set (2 to 24). It uses the
subscription path unchanged and adds a Stripe subscription schedule of
exactly that many invoices (`lib/payment-plans-stripe.ts`), with a trial as
its own phase in front when the price has one. When the schedule ends,
`customer.subscription.deleted` counts the subscription's paid invoices:
enough means `markPlanPaidOff` (ownership stays active, subscription id
cleared, apps pushed); fewer means cancelled, as any subscription. The pure
decisions live in `lib/payment-plans.ts`.

A refund ends the schedule (Stripe will not cancel a scheduled subscription
directly); a member's own cancel releases the schedule first so
`cancel_at_period_end` can be set.
```

Append to `docs/lessons.md`:

```markdown
## Stripe refuses to cancel a subscription a schedule manages (15 Sep 2026)

Cancel the schedule and the subscription goes with it; release the schedule
if you only want to set `cancel_at_period_end`. `endSubscription` and
`releaseSchedule` in `lib/payment-plans-stripe.ts` know which is which. A
paid-off plan is decided by counting paid invoices with `amount_paid > 0`,
because the end-of-schedule event looks the same as Stripe giving up.
```

- [ ] **Step 2: Commit**

```bash
git add docs/products-and-offers.md docs/lessons.md
git commit -m "Docs: payment plans"
```

---

## Self-review

**Spec coverage.** Data → Task 1. Copy table, `savingAgainst`, `membershipTerms`, `chargeNowCents` → Task 2. Admin editor, validation, reprice rule, both tables → Task 3. Stripe schedule with trial phase, metadata, refund ends schedule, member cancel releases → Task 4. Webhook branch, `markPlanPaidOff`, invoice counting, $0 invoice excluded, idempotent second delivery → Task 5. Coupon "off each payment", Meta via existing paths (no task: `recordRenewal` and the first-invoice Purchase are untouched), end-to-end test with refund → Task 6. Duplicate copies the column: `duplicateRow(p, …)` copies every column from `select("*")`, so no task; the reprice rule covers `installments` in Task 3. Library unchanged by design.

**Placeholders.** None. Task 5 and Task 6 tell the implementer to read a sibling fixture for a seeded id; that is a lookup, not an invention.

**Type consistency.** `installments: number | null` on `OfferPrice`, `Offer`, `PriceFields`, the zod schema and the DB column. `isPlan`, `planSentence`, `cadenceWords`, `planOutcome` (Task 2) are what Tasks 4, 5, 6 import. `scheduleInstalments(sub, installments)`, `endSubscription(id)`, `releaseSchedule(id)` (Task 4) are what Tasks 4 and 6 use. `markPlanPaidOff(id): Promise<{ paidOff: number }>` (Task 5) matches its tests.

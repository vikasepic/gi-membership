# Content Engine channel offers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sell Content Engine as Instagram-only, LinkedIn-only and both, and let a Stripe promotion code limit itself to one billing interval and replace the trial length.

**Architecture:** Four independent code changes plus one data task. The coupon module learns two new metadata keys and gains the billing interval in its scope; the two subscription-creation sites prefer the coupon's trial over the price's; trial history is recorded per channel instead of per app; and app entitlements are sent once per person per app carrying the union of their channels. The three offers themselves are created through the admin, not in code.

**Tech Stack:** Next.js 15 App Router server actions, Stripe (promotion codes, subscriptions), Supabase/Postgres via `createServiceClient`, vitest (unit + jsdom + self-skipping `*.integration.test.ts`).

**Spec:** `docs/superpowers/specs/2026-09-07-content-engine-channel-offers-design.md`

## Global Constraints

- Coupons are **default deny**: a code works only if its metadata carries `store=grow`. Never weaken this.
- The discount is **never computed for a subscription**. Stripe is handed `discounts: [{ promotion_code }]` and applies the duration itself. Only one-time charges subtract `discountCents` locally.
- `intervals` metadata is a comma-separated list of `day|week|month|year`. When present, the interval being bought must be one of them. A one-time purchase (interval `null`) is refused by any code that names intervals.
- `trial_days` metadata is an integer 0–365. Out-of-range or non-numeric values are **ignored, not refused** — a typo in Stripe must not break a code that also carries a discount. Applies only to recurring purchases.
- A coupon that carries `trial_days` is **valid with a zero discount**. Every other coupon still requires a discount above zero.
- Trial keys: an offer with channels produces one key per channel; an offer with no channels keeps today's single key **byte-identical**, so products and the Funnel App are untouched.
- `pushOwnershipStateToApps` sends **one message per (user, app)**. Apps whose offers grant no channels must see no change at all.
- Money is integer cents everywhere. `MIN_CHARGE_CENTS = 50`.
- Integration tests self-skip on `!process.env.SUPABASE_SERVICE_ROLE_KEY` via `describe.skipIf`. Never guard on a URL.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/coupons.ts` (modify) | Reads the two new metadata keys, gains `interval` in the scope, returns `trialDays`. |
| `lib/offer-checkout.ts` (modify, 3 call sites) | Passes the chosen price's interval into the scope. |
| `lib/checkout.ts` (modify, 2 coupon call sites + 2 subscription sites) | Same for products; prefers the coupon's trial when creating a subscription. |
| `app/(store)/checkout/actions.ts` (modify, 1 call site) | The product coupon preview passes an interval. |
| `lib/trial-history.ts` (modify) | `grantKeysOf` replaces `grantKeyOf`; trials recorded and checked per channel. |
| `lib/app-sync.ts` (modify) | Groups ownership rows by (user, app) and sends one unioned entitlement. |

---

## Task 1: The coupon learns intervals and trial days

**Files:**
- Modify: `lib/coupons.ts`
- Test: `lib/coupons.test.ts` (create if absent)

**Interfaces:**
- Produces:
  - `type CouponScope = { item: string; interval: "day" | "week" | "month" | "year" | null }`
  - `AppliedCoupon` gains `trialDays: number | null`
  - `export const INTERVALS_META_KEY = "intervals"` and `export const TRIAL_DAYS_META_KEY = "trial_days"`
  - `export function couponTrialDays(meta: Record<string, string>): number | null` — pure, exported for testing.

**The defect this task fixes, which the spec got wrong:** the spec suggested creating a trial-only code with a nominal `0.01%` discount. On a $29 price that is `Math.round(2900 * 0.01 / 100)` = `Math.round(0.29)` = **0**, and the existing guard `if (discount <= 0) return { ok: false, ... }` refuses it outright. A trial-only coupon is therefore impossible until that guard admits one.

- [ ] **Step 1: Write the failing tests**

Create `lib/coupons.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { couponTrialDays, intervalAllowed } from "@/lib/coupons";

describe("the trial a coupon carries", () => {
  it("reads a whole number of days", () => {
    expect(couponTrialDays({ trial_days: "30" })).toBe(30);
    expect(couponTrialDays({ trial_days: " 14 " })).toBe(14);
  });

  it("has none when the key is absent", () => {
    expect(couponTrialDays({})).toBeNull();
  });

  it("ignores nonsense rather than refusing the whole code", () => {
    // A typo in Stripe must not break a code that also carries a discount.
    // Refusing here would take a working promotion off the air over a stray
    // character in a field that is optional in the first place.
    for (const bad of ["", "thirty", "30.5", "-1", "366", "1e3"]) {
      expect(couponTrialDays({ trial_days: bad })).toBeNull();
    }
  });

  it("allows zero, which means no trial at all", () => {
    // Distinct from absent: a code can deliberately REMOVE a trial.
    expect(couponTrialDays({ trial_days: "0" })).toBe(0);
  });
});

describe("which billing intervals a coupon allows", () => {
  it("allows everything when it names nothing", () => {
    expect(intervalAllowed({}, "month")).toBe(true);
    expect(intervalAllowed({}, "year")).toBe(true);
    expect(intervalAllowed({}, null)).toBe(true);
  });

  it("allows only what it names", () => {
    expect(intervalAllowed({ intervals: "month" }, "month")).toBe(true);
    expect(intervalAllowed({ intervals: "month" }, "year")).toBe(false);
    expect(intervalAllowed({ intervals: "month,year" }, "year")).toBe(true);
  });

  it("refuses a one-time purchase when it names intervals", () => {
    // A one-time charge has no interval, so a code that names one cannot
    // sensibly apply to it. This is the guard that stops a "2 months free"
    // code being flattened onto a single payment.
    expect(intervalAllowed({ intervals: "month" }, null)).toBe(false);
  });

  it("is not fooled by spacing or case", () => {
    expect(intervalAllowed({ intervals: " Month , YEAR " }, "year")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/coupons.test.ts`
Expected: FAIL — `couponTrialDays` and `intervalAllowed` are not exported from `@/lib/coupons`.

- [ ] **Step 3: Add the two pure helpers**

In `lib/coupons.ts`, after the `ITEMS_META_KEY` declaration, add:

```ts
/**
 * Metadata that limits a coupon to particular billing periods.
 *
 * `intervals` = a comma-separated list of day|week|month|year. Absent means
 * every interval, which is what every code written before this did.
 *
 * It exists because a duration-based coupon means something very different on
 * a yearly price: `duration: repeating, duration_in_months: 2` discounts the
 * whole ANNUAL invoice, because the next one falls twelve months later, well
 * outside the window. A "2 months free" code on a $199/year plan gives away a
 * free year. DPBS on this account is configured exactly that way.
 */
export const INTERVALS_META_KEY = "intervals";

/**
 * Metadata that replaces the trial length for this purchase.
 *
 * `trial_days` = a whole number of days, 0 to 365. A Stripe coupon cannot
 * extend a trial — it discounts money — so this is the only way to sell "30
 * days free, then the usual price", which is a different promotion from any
 * amount off.
 */
export const TRIAL_DAYS_META_KEY = "trial_days";

/** Which interval is being bought; null for a one-time purchase. */
export type BillingInterval = "day" | "week" | "month" | "year";

/**
 * The trial this coupon grants, or null when it says nothing about one.
 *
 * Nonsense is IGNORED rather than refused. This field is optional, so a typo
 * in it must not take a working discount off the air — the failure would be a
 * code that silently stops working, reported as "the coupon is broken", with
 * nothing pointing at a stray character in an unrelated field.
 *
 * Zero is a real value and distinct from absent: a code may deliberately
 * remove a trial rather than extend one.
 */
export function couponTrialDays(meta: Record<string, string>): number | null {
  const raw = (meta[TRIAL_DAYS_META_KEY] ?? "").trim();
  if (!/^\d{1,3}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 0 && n <= 365 ? n : null;
}

/** Whether this coupon may be used on a purchase billed at this interval. */
export function intervalAllowed(
  meta: Record<string, string>,
  interval: BillingInterval | null,
): boolean {
  const only = (meta[INTERVALS_META_KEY] ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (only.length === 0) return true;
  // A one-time charge has no interval, so a code that names one cannot apply.
  if (!interval) return false;
  return only.includes(interval);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/coupons.test.ts`
Expected: PASS, 9 cases.

- [ ] **Step 5: Widen the scope and the result**

In `lib/coupons.ts`, replace the `CouponScope` type with:

```ts
export type CouponScope = {
  /** The product's slug, or the offer's key. */
  item: string;
  /**
   * The billing interval being bought, or null for a one-time purchase.
   *
   * Required rather than optional for the same reason `item` is: an optional
   * scope field is one every future call site can forget, and forgetting it is
   * exactly the bug this exists to close.
   */
  interval: BillingInterval | null;
};
```

Add to the `AppliedCoupon` type, after `clamped`:

```ts
  /**
   * The trial this code grants, replacing the price's own. Null when it says
   * nothing about one, which is every code written before this.
   */
  trialDays: number | null;
```

- [ ] **Step 6: Enforce the interval and carry the trial through**

In `resolveCoupon`, immediately after the existing `only.length > 0 && !only.includes(...)` items check, add:

```ts
  // And if it names billing periods, this has to be one of them. Same message
  // as a wrong item: the code exists and is simply not for this purchase.
  if (!intervalAllowed(meta, scope.interval)) {
    return { ok: false, error: "That code can't be used on this purchase." };
  }
```

Then, immediately before `let discount = 0;`, add:

```ts
  const trialDays = couponTrialDays(meta);
```

Replace the zero-discount guard with:

```ts
  // A trial-only code is valid with nothing off. Stripe will not create a
  // coupon with no discount at all, so such a code carries a nominal one — and
  // a nominal percentage rounds to zero cents on a small price, which this
  // guard used to refuse outright. Without this branch a trial-only promotion
  // is impossible to express.
  if (discount <= 0 && trialDays === null) {
    return { ok: false, error: "This order is already at the minimum charge." };
  }
```

And add `trialDays` to the returned coupon object, after `clamped`:

```ts
      clamped,
      trialDays,
```

- [ ] **Step 7: Typecheck to find every call site**

Run: `npx tsc --noEmit`
Expected: FAIL, with one error per `resolveCoupon` call missing `interval`. There are six:
`app/(store)/checkout/actions.ts:147`, `lib/checkout.ts:420`, `lib/checkout.ts:920`, `lib/offer-checkout.ts:62`, `lib/offer-checkout.ts:120`, `lib/offer-checkout.ts:213`.

Leave them failing — Task 2 fixes them. Do not commit a red typecheck; this task's commit comes after Task 2. Skip to Task 2 now.

---

## Task 2: Every call site passes its interval, and the trial reaches Stripe

**Files:**
- Modify: `lib/offer-checkout.ts` (3 call sites)
- Modify: `lib/checkout.ts` (2 coupon call sites, 2 subscription sites)
- Modify: `app/(store)/checkout/actions.ts` (1 call site)
- Test: `lib/checkout-trial-wiring.test.ts` (create)

**Interfaces:**
- Consumes: `CouponScope { item, interval }` and `AppliedCoupon.trialDays` from Task 1.
- Produces: nothing new; this is wiring.

**Context you need:** in `lib/offer-checkout.ts` all three sites already have an `offer` in scope that has been through `offerAtPrice`, so `offer.interval` and `offer.billingType` are the CHOSEN price's, not the headline. In `lib/checkout.ts:420` the chosen price is `chosen` and `recurring` is already computed on the line above. At `lib/checkout.ts:920` the chosen price is `price`.

- [ ] **Step 1: Write the failing test**

Create `lib/checkout-trial-wiring.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The coupon's trial beats the price's, at both places a subscription is made.
 *
 * A source-reading test because the alternative is driving two Stripe
 * subscription creations against a live API, and the failure this catches is
 * one of the two sites being missed — which would look like the promotion
 * working, until somebody bought the other kind of thing.
 */
describe("a coupon's trial reaches Stripe", () => {
  const src = readFileSync("lib/checkout.ts", "utf8");

  it("prefers the coupon's trial at both subscription sites", () => {
    const uses = src.match(/trial_period_days:\s*[^\n]*/g) ?? [];
    expect(uses).toHaveLength(2);
    for (const line of uses) {
      expect(line).toMatch(/coupon/);
      expect(line).toMatch(/\?\?/);
    }
  });

  it("still hands Stripe the promotion code rather than computing a discount", () => {
    // The duration is Stripe's to apply. Computing it here is how the invoice
    // and the receipt start disagreeing.
    expect(src.match(/promotion_code:/g) ?? []).toHaveLength(2);
  });
});

describe("every coupon lookup says what interval is being bought", () => {
  for (const file of [
    "lib/offer-checkout.ts",
    "lib/checkout.ts",
    "app/(store)/checkout/actions.ts",
  ]) {
    it(`${file} passes an interval with every item`, () => {
      const s = readFileSync(file, "utf8");
      const items = s.match(/item:\s*[^,\n]+/g) ?? [];
      const intervals = s.match(/interval:\s*[^,\n]+/g) ?? [];
      expect(items.length).toBeGreaterThan(0);
      expect(intervals.length).toBeGreaterThanOrEqual(items.length);
    });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/checkout-trial-wiring.test.ts`
Expected: FAIL — `trial_period_days` lines do not mention `coupon`, and the scope objects have no `interval`.

- [ ] **Step 3: Pass the interval at the three offer call sites**

In `lib/offer-checkout.ts`, each of the three `resolveCoupon` calls ends with a scope object. Replace each scope with the interval-carrying form. At line ~66 the variable is `offer`:

```ts
    { item: offer.key, interval: offer.billingType === "recurring" ? offer.interval : null },
```

At line ~124 the variable is `priced`:

```ts
      { item: priced.key, interval: priced.billingType === "recurring" ? priced.interval : null },
```

At line ~217 the variable is `offer` again:

```ts
      { item: offer.key, interval: offer.billingType === "recurring" ? offer.interval : null },
```

- [ ] **Step 4: Pass the interval at the two product call sites**

In `lib/checkout.ts` at ~420, `recurring` and `chosen` are already in scope:

```ts
    const res = await resolveCoupon(input.couponCode, listCents, product.currency, {
      item: product.slug,
      interval: recurring ? (chosen?.interval ?? null) : null,
    });
```

At ~920, the chosen price is `price`:

```ts
    const coupon = pi.metadata.couponCode
      ? await resolveCoupon(pi.metadata.couponCode, price.priceCents, prod.currency, {
          item: prod.slug,
          interval: price.billingType === "recurring" ? price.interval : null,
        })
      : null;
```

In `app/(store)/checkout/actions.ts` at ~147, the preview has no price choice, so it uses the product's headline billing:

```ts
  const res = await resolveCoupon(code, product.priceCents, product.currency, {
    item: product.slug,
    // The preview has no price choice to read, so it scopes to the product's
    // headline billing. A multi-price PRODUCT could therefore preview an
    // interval-scoped code as valid and have the charge refuse it. No product
    // is sold that way today, and the offer checkout — which is what the
    // Content Engine offers use — passes the chosen price's interval exactly.
    interval: product.billingType === "recurring" ? product.interval : null,
  });
```

- [ ] **Step 5: Prefer the coupon's trial at both subscription sites**

In `lib/checkout.ts` at ~696 (the offer path), replace:

```ts
        trial_period_days: offer.trialDays ?? undefined,
```

with:

```ts
        // The coupon's trial wins when it carries one. A Stripe coupon cannot
        // extend a trial itself — it discounts money — so this is the only
        // place "30 days free instead of 7" can be expressed.
        trial_period_days: coupon?.trialDays ?? offer.trialDays ?? undefined,
```

At ~942 (the product path), replace:

```ts
        trial_period_days: price.trialDays ?? undefined,
```

with:

```ts
        // As on the offer path: a coupon carrying trial_days replaces the
        // price's own trial for this purchase.
        trial_period_days: coupon?.ok ? (coupon.coupon.trialDays ?? price.trialDays ?? undefined) : (price.trialDays ?? undefined),
```

Note the shape difference: at ~696 `coupon` is an `AppliedCoupon | null`; at ~942 it is the `CouponResult` returned by `resolveCoupon`, so it must be unwrapped through `.ok` and `.coupon`.

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npx vitest run lib/checkout-trial-wiring.test.ts lib/coupons.test.ts && npx tsc --noEmit`
Expected: tests PASS; typecheck clean.

- [ ] **Step 7: Run the whole suite**

Run: `npx vitest run`
Expected: PASS. Any existing test constructing a `CouponScope` needs `interval` adding — update those to `interval: null` unless the test is about a subscription, in which case use the interval it is testing.

- [ ] **Step 8: Commit**

```bash
git add lib/coupons.ts lib/coupons.test.ts lib/offer-checkout.ts lib/checkout.ts "app/(store)/checkout/actions.ts" lib/checkout-trial-wiring.test.ts
git commit -m "Let a coupon name its billing period and buy trial days"
```

---

## Task 3: The checkout says what the code did

**Files:**
- Modify: `lib/offer-checkout.ts` (the preview return at ~68-74)
- Modify: `app/(store)/checkout/offer/page.tsx` or the component that renders the coupon result — locate it by searching for `recurringDiscount`
- Test: extend `lib/coupons.test.ts`

**Interfaces:**
- Consumes: `AppliedCoupon.trialDays` from Task 1.
- Produces: `export function couponTrialNote(trialDays: number | null, priceTrialDays: number | null): string | null` in `lib/coupons.ts` — the sentence shown under an applied code, or null when the code changes nothing about the trial.

**Why this task exists:** a promotion the buyer cannot see is a promotion they do not trust. If a code silently turns 7 days into 30 and the page still says "7 days free", the only person who knows is Stripe.

- [ ] **Step 1: Write the failing test**

Append to `lib/coupons.test.ts`:

```ts
import { couponTrialNote } from "@/lib/coupons";

describe("what the buyer is told about a coupon's trial", () => {
  it("says nothing when the code does not touch the trial", () => {
    expect(couponTrialNote(null, 7)).toBeNull();
  });

  it("says nothing when the code grants the trial they already had", () => {
    // Technically a change, visibly not one. Saying "30 days free" twice is
    // noise, and noise beside a price reads as a trick.
    expect(couponTrialNote(30, 30)).toBeNull();
  });

  it("names the longer trial the code buys", () => {
    expect(couponTrialNote(30, 7)).toBe("30 days free instead of 7");
  });

  it("is honest when a code shortens or removes the trial", () => {
    expect(couponTrialNote(0, 7)).toBe("no free trial with this code");
    expect(couponTrialNote(3, 7)).toBe("3 days free instead of 7");
  });

  it("names a trial added to a price that had none", () => {
    expect(couponTrialNote(30, null)).toBe("30 days free");
    expect(couponTrialNote(30, 0)).toBe("30 days free");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/coupons.test.ts`
Expected: FAIL — `couponTrialNote` is not exported.

- [ ] **Step 3: Write the helper**

Append to `lib/coupons.ts`:

```ts
/**
 * What to say under an applied code about the trial it changes.
 *
 * Null when it changes nothing, so the caller renders nothing rather than a
 * line that repeats what the price already said. A promotion the buyer cannot
 * see is one they do not trust, and one that restates itself reads as a trick.
 */
export function couponTrialNote(
  trialDays: number | null,
  priceTrialDays: number | null,
): string | null {
  if (trialDays === null) return null;
  const had = priceTrialDays ?? 0;
  if (trialDays === had) return null;
  if (trialDays === 0) return "no free trial with this code";
  if (had === 0) return `${trialDays} days free`;
  return `${trialDays} days free instead of ${had}`;
}
```

- [ ] **Step 4: Carry it out of the preview**

In `lib/offer-checkout.ts`, the preview's success return (~line 68) currently reads:

```ts
  return {
    ok: true,
    label: res.coupon.label,
    discountCents: res.coupon.discountCents,
    clamped: res.coupon.clamped,
    recurringDiscount: res.coupon.recurringDiscount,
  };
```

Add the note, computed against the chosen price's trial:

```ts
  return {
    ok: true,
    label: res.coupon.label,
    discountCents: res.coupon.discountCents,
    clamped: res.coupon.clamped,
    recurringDiscount: res.coupon.recurringDiscount,
    trialNote: couponTrialNote(res.coupon.trialDays, offer.trialDays),
  };
```

Import `couponTrialNote` alongside the existing `resolveCoupon` import, and widen the function's declared return type to include `trialNote: string | null`.

- [ ] **Step 5: Render it**

Run: `grep -rn "recurringDiscount" app components | grep -v "\.test\."`

In each component that displays an applied coupon, render `trialNote` beneath the discount line when it is non-null, using the same muted text style the surrounding summary uses. Do not invent a new visual treatment — match what `clamped` and `recurringDiscount` already do.

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 7: Commit**

```bash
git add lib/coupons.ts lib/coupons.test.ts lib/offer-checkout.ts app components
git commit -m "Say what a coupon did to the trial"
```

---

## Task 4: Trials are recorded per channel

**Files:**
- Modify: `lib/trial-history.ts`
- Test: `lib/trial-history.test.ts` (create if absent; check first)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export function grantKeysOf(offer: Pick<Offer, "grantAppId" | "grantEntitlementKey" | "grantProductId" | "grantChannels">): string[]` — replaces `grantKeyOf`. Returns `[]` when the offer grants nothing.

**The invariant that must not break:** an offer with **no** channels must produce exactly the string `grantKeyOf` produced before, byte for byte. Products and the Funnel App have rows in `trial_history` under those keys, and a changed format silently re-grants everyone a trial they have already used.

- [ ] **Step 1: Write the failing test**

Create `lib/trial-history.test.ts` (if it exists, append the describe blocks):

```ts
import { describe, it, expect } from "vitest";
import { grantKeysOf } from "@/lib/trial-history";

const app = (channels: string[]) => ({
  grantAppId: "8ee0321c-c78b-4638-a4a6-81a70d1e37bb",
  grantEntitlementKey: "content-engine",
  grantProductId: null,
  grantChannels: channels,
});

describe("what a trial is recorded against", () => {
  it("keeps the old key exactly when an offer has no channels", () => {
    // Rows already exist under this string. A changed format would silently
    // hand everybody a second free trial of something they have had.
    expect(grantKeysOf(app([]))).toEqual([
      "app:8ee0321c-c78b-4638-a4a6-81a70d1e37bb:content-engine",
    ]);
  });

  it("records a product grant unchanged", () => {
    expect(
      grantKeysOf({ grantAppId: null, grantEntitlementKey: null, grantProductId: "p1", grantChannels: [] }),
    ).toEqual(["product:p1"]);
  });

  it("gives one key per channel", () => {
    expect(grantKeysOf(app(["instagram"]))).toEqual([
      "app:8ee0321c-c78b-4638-a4a6-81a70d1e37bb:content-engine:ch:instagram",
    ]);
  });

  it("gives the bundle both channels' keys", () => {
    expect(grantKeysOf(app(["instagram", "linkedin"]))).toEqual([
      "app:8ee0321c-c78b-4638-a4a6-81a70d1e37bb:content-engine:ch:instagram",
      "app:8ee0321c-c78b-4638-a4a6-81a70d1e37bb:content-engine:ch:linkedin",
    ]);
  });

  it("orders channels the same way however they arrive", () => {
    // The key IS the identity. Two spellings of one channel set would be two
    // trials, which is the loophole this is meant to close.
    expect(grantKeysOf(app(["linkedin", "instagram"]))).toEqual(grantKeysOf(app(["instagram", "linkedin"])));
  });

  it("grants nothing a key when it grants nothing", () => {
    expect(
      grantKeysOf({ grantAppId: null, grantEntitlementKey: null, grantProductId: null, grantChannels: [] }),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/trial-history.test.ts`
Expected: FAIL — `grantKeysOf` is not exported.

- [ ] **Step 3: Replace the key function**

In `lib/trial-history.ts`, replace `grantKeyOf` entirely with:

```ts
/**
 * What a trial actually gave away, as one key per thing given.
 *
 * Keyed on the GRANT rather than the offer: the monthly and the yearly Content
 * Engine offers both grant the same app, so trialling one has to close the
 * other — an offer-keyed record is a loophole with two doors.
 *
 * And keyed per CHANNEL, because the channels are sold separately. Instagram
 * and LinkedIn can each be trialled once; monthly and yearly of one channel
 * still share a trial because the channel is what splits, not the price; and
 * the bundle is refused a trial once either of its channels has been used.
 *
 * An offer with no channels produces exactly the string this produced before
 * the channels existed. Rows already exist under it, and a changed format
 * would silently hand everybody a second free trial.
 */
export function grantKeysOf(
  offer: Pick<Offer, "grantAppId" | "grantEntitlementKey" | "grantProductId" | "grantChannels">,
): string[] {
  if (offer.grantAppId) {
    const base = `app:${offer.grantAppId}:${offer.grantEntitlementKey ?? ""}`;
    const channels = [...(offer.grantChannels ?? [])].sort();
    // Sorted so one channel set is one identity however the array arrived.
    return channels.length === 0 ? [base] : channels.map((c) => `${base}:ch:${c}`);
  }
  if (offer.grantProductId) return [`product:${offer.grantProductId}`];
  return [];
}
```

- [ ] **Step 4: Check and record against every key**

In `hasHadTrial`, replace the single-key lookup. The existing body reads the key, returns false when null, then queries `trial_history`. Replace the key handling so it asks about all of them:

```ts
  const keys = grantKeysOf(offer);
  if (keys.length === 0) return false;
  try {
    const db = createServiceClient();
    const { data } = await db
      .from("trial_history")
      .select("id")
      .eq("store_id", await getStoreId())
      .eq("email", norm(email))
      .in("grant_key", keys)
      .limit(1);
    // ANY of them: someone who has trialled Instagram has used the bundle's
    // Instagram half, so the bundle's trial is gone too.
    return (data?.length ?? 0) > 0;
  } catch {
    // A lookup that fails must not refuse somebody a trial they are owed.
    return false;
  }
```

In `recordTrialStart`, write one row per key:

```ts
  const keys = grantKeysOf(offer);
  if (keys.length === 0) return;
  try {
    const db = createServiceClient();
    const storeId = await getStoreId();
    await db.from("trial_history").upsert(
      keys.map((grant_key) => ({ store_id: storeId, email: norm(email), grant_key })),
      { onConflict: "store_id,email,grant_key" },
    );
  } catch (e) {
    console.error("[recordTrialStart] could not record:", e);
  }
```

`trial_history` has `unique (store_id, email, grant_key)`, so the upsert is safe to replay.

Keep the surrounding doc comments and the `norm` helper as they are. If `hasHadTrial` or `recordTrialStart` differ in shape from the above, adapt the key handling and leave the rest alone rather than rewriting the function.

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run lib/trial-history.test.ts && npx tsc --noEmit`
Expected: PASS, clean. Fix any remaining reference to `grantKeyOf` — there should be none outside this file.

- [ ] **Step 6: Run the whole suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/trial-history.ts lib/trial-history.test.ts
git commit -m "Record a trial against each channel it gave away"
```

---

## Task 5: One entitlement per person per app

**Files:**
- Modify: `lib/app-sync.ts` (`pushOwnershipStateToApps`)
- Test: `lib/entitlement-union.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export function unionEntitlement(rows: { appId: string; channels: string[]; status: OwnershipStatus }[]): { channels: string[]; status: OwnershipStatus }` — pure, exported so the aggregation can be tested without a database or an HTTP call.

**Why:** two subscriptions granting the same app currently send two messages carrying the same `entitlementKey` and different channel lists, and the second almost certainly overwrites the first in the receiving app. The store computes the union instead and sends one.

- [ ] **Step 1: Write the failing test**

Create `lib/entitlement-union.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { unionEntitlement } from "@/lib/app-sync";

const row = (channels: string[], status: "active" | "trialing" | "canceled" | "past_due") => ({
  appId: "a1",
  channels,
  status,
});

describe("what one person is entitled to in one app", () => {
  it("adds up the channels they are paying for", () => {
    expect(unionEntitlement([row(["instagram"], "active"), row(["linkedin"], "active")])).toEqual({
      channels: ["instagram", "linkedin"],
      status: "active",
    });
  });

  it("drops the channels of a cancelled subscription", () => {
    // The case that catches a merge bug on the receiving side, and the reason
    // this function exists: cancelling Instagram must actually take Instagram
    // away while LinkedIn carries on.
    expect(unionEntitlement([row(["instagram"], "canceled"), row(["linkedin"], "active")])).toEqual({
      channels: ["linkedin"],
      status: "active",
    });
  });

  it("is cancelled only when everything is", () => {
    expect(unionEntitlement([row(["instagram"], "canceled"), row(["linkedin"], "canceled")])).toEqual({
      channels: [],
      status: "canceled",
    });
  });

  it("reports a trial while any part of it is trialing", () => {
    expect(unionEntitlement([row(["instagram"], "trialing"), row(["linkedin"], "active")]).status).toBe("trialing");
  });

  it("reports past_due only when nothing is live", () => {
    expect(unionEntitlement([row(["instagram"], "past_due"), row(["linkedin"], "active")]).status).toBe("active");
    expect(unionEntitlement([row(["instagram"], "past_due")]).status).toBe("past_due");
  });

  it("does not repeat a channel two subscriptions share", () => {
    expect(unionEntitlement([row(["instagram"], "active"), row(["instagram", "linkedin"], "active")]).channels)
      .toEqual(["instagram", "linkedin"]);
  });

  it("leaves an app that grants no channels with none", () => {
    // The Funnel App. Its union must stay empty so the field is omitted from
    // the payload exactly as it is today.
    expect(unionEntitlement([row([], "active")])).toEqual({ channels: [], status: "active" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/entitlement-union.test.ts`
Expected: FAIL — `unionEntitlement` is not exported from `@/lib/app-sync`.

- [ ] **Step 3: Write the aggregation**

Add to `lib/app-sync.ts`, above `pushOwnershipStateToApps`:

```ts
/**
 * Everything one person is entitled to in one app, as a single answer.
 *
 * Two subscriptions granting the same app used to send two messages under one
 * entitlement key, and the second overwrote the first — so buying LinkedIn
 * took Instagram away, or cancelling one left both unlocked, depending on
 * which side the receiving app came down on. The store decides instead.
 *
 * Only live rows contribute channels. A cancelled subscription's channels are
 * gone, which is the whole point: the receiving app replaces its list with
 * this one, so a channel that stops appearing is a channel that stops working.
 */
export function unionEntitlement(
  rows: { channels: string[]; status: OwnershipStatus }[],
): { channels: string[]; status: OwnershipStatus } {
  const live = rows.filter((r) => r.status === "active" || r.status === "trialing");
  const channels = [...new Set(live.flatMap((r) => r.channels ?? []))].sort();
  const status: OwnershipStatus = rows.some((r) => r.status === "trialing")
    ? "trialing"
    : rows.some((r) => r.status === "active")
      ? "active"
      : rows.some((r) => r.status === "past_due")
        ? "past_due"
        : "canceled";
  return { channels, status };
}
```

Note the parameter type takes only `channels` and `status`; the test's rows carry an extra `appId`, which TypeScript accepts on an object literal passed through a variable.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/entitlement-union.test.ts`
Expected: PASS, 7 cases.

- [ ] **Step 5: Send one message per person per app**

In `pushOwnershipStateToApps`, the existing loop reads each row, looks up the offer's `grant_entitlement_key` and `grant_channels`, then calls `notifyAppEntitlement` per row.

Restructure it so that, after loading the rows:

1. For every row, resolve its offer's `grant_entitlement_key` and `grant_channels` as it does now.
2. Group the rows by `` `${user_id}:${app_id}` ``.
3. For each group, call `unionEntitlement` on its rows' `{ channels, status }`.
4. Send **one** `notifyAppEntitlement` per group, using: the group's `app_id`, the user's email and username, the entitlement key from any row in the group (they share one — if they differ, take the first and carry on), the unioned `channels` and `status`, the most recent `stripe_customer_id` as it does now, and the `stripe_subscription_id` of any live row in the group, or the first row when none is live.

Keep the per-row email lookup, the customer-id lookup and the best-effort error handling exactly as they are — only the grouping and the single send are new. `notifyAppEntitlement` already omits `channels` when the array is empty, so an app granting no channels sends precisely what it sends today.

- [ ] **Step 6: Run the whole suite and the typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 7: Commit**

```bash
git add lib/app-sync.ts lib/entitlement-union.test.ts
git commit -m "Tell an app everything a person is entitled to, once"
```

---

## Task 6: Create the three offers

**Files:** none — this is data, created through the admin at `/admin/offers`.

**Interfaces:**
- Consumes: the code from Tasks 1–5, deployed.
- Produces: three offer rows and their prices.

Migrations are for schema. Seeding catalogue rows through them puts pricing decisions somewhere nobody looks for them, and the admin path exercises validation a direct insert skips.

- [ ] **Step 1: Add the yearly price to the Instagram offer**

`content-engine-instagram` already exists with `grant_channels = {instagram}` and a $29/month price with a 7-day trial. In `/admin/offers`, open it and add a second price:

- Label: `Yearly`
- Billing: recurring, interval `year`, interval count 1
- Price: `19900` cents ($199)
- Trial days: leave empty

- [ ] **Step 2: Create the LinkedIn offer**

New offer:
- Name: `Content Engine — LinkedIn`
- Key: `content-engine-linkedin`
- Grant type: subscription, app **Content Engine**, entitlement key `content-engine`
- Channels: **LinkedIn only**
- Prices: `$29/month, 7-day trial` and `$199/year, no trial`

- [ ] **Step 3: Create the bundle offer**

New offer:
- Name: `Content Engine — Instagram + LinkedIn`
- Key: `content-engine`
- Grant type: subscription, app **Content Engine**, entitlement key `content-engine`
- Channels: **Instagram and LinkedIn**
- Prices: `$58/month, 7-day trial` and `$398/year, no trial`

- [ ] **Step 4: Give the two new offers sales pages**

`/o/<key>` returns 404 for an offer with no page sections. Copy the Instagram offer's eleven sections to each new offer using the copy-page tool in the page editor, then edit the copy to name the right channel.

- [ ] **Step 5: Verify each page renders both prices**

Open each of the three, signed out:

```
https://grow.greaterinside.com/o/content-engine-instagram
https://grow.greaterinside.com/o/content-engine-linkedin
https://grow.greaterinside.com/o/content-engine
```

Each must return 200 and show both the monthly and the yearly option. `/o/<key>` renders `livePrices(offer.prices)` already, so two prices appear without any code change — if only one shows, the second price was saved as archived.

- [ ] **Step 6: Verify the entitlement each one claims**

Run against production, checking that channels and keys are what the funnel expects:

```bash
docker exec supabase-db-fuv6argrk5j8ogd4y3hi5tu0 psql -U postgres -d postgres -c \
  "select key, grant_channels, grant_entitlement_key, active from offers where key like 'content-engine%';"
```

Expected: three rows; channels `{instagram}`, `{linkedin}`, `{instagram,linkedin}`; the same entitlement key on all three; all active.

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| `intervals` metadata limits a code to billing periods | 1 |
| One-time purchase refused by a code naming intervals | 1 |
| `trial_days` metadata replaces the trial | 1 |
| Bad `trial_days` ignored, not refused | 1 |
| Trial-only coupon valid with zero discount | 1 (and see the note below) |
| `CouponScope` gains a required `interval` | 1, wired in 2 |
| `AppliedCoupon.trialDays` | 1 |
| Trial override at both subscription sites | 2 |
| Discount still handed to Stripe, never computed for a subscription | 2 (asserted) |
| Checkout states the coupon's trial | 3 |
| Switching price re-validates the code | 2 — the interval is in the scope, so a re-resolve at the new price refuses it |
| Trials recorded per channel | 4 |
| No-channel offers keep today's key byte-for-byte | 4 (asserted) |
| Bundle refused a trial after either channel used | 4 |
| One entitlement per person per app, unioned | 5 |
| Apps granting no channels unaffected | 5 (asserted) |
| Sales pages need no code | 6 (verified, not built) |
| Three offers with the stated prices | 6 |

No gaps.

**2. Placeholder scan.** No "TBD", no "handle errors". Two steps are deliberately descriptive rather than literal — Task 3 Step 5 (render `trialNote`, because the component is found by grep and must match its neighbours) and Task 5 Step 5 (restructure a loop whose exact current shape the implementer will read). Both name the exact file, the exact inputs and the exact invariant to preserve.

**3. Type consistency.** `grantKeysOf` returns `string[]` and is used as such in both call sites. `unionEntitlement` takes `{ channels, status }[]` and returns `{ channels, status }`. `CouponScope.interval` is `BillingInterval | null` in the type and at all six call sites. `AppliedCoupon.trialDays` is `number | null`, consumed as such at both subscription sites and by `couponTrialNote`. The two subscription sites hold different shapes — `AppliedCoupon | null` at ~696 and `CouponResult | null` at ~942 — which Task 2 Step 5 calls out explicitly, because writing the same expression at both would be wrong at one of them.

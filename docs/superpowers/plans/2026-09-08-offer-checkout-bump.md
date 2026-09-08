# Order Bump on an Offer's Checkout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an offer's checkout carry a one-time order bump, charged in the same on-session payment as the offer itself.

**Architecture:** Part 1 changes the standalone offer checkout so a **one-time** offer is charged with a PaymentIntent the buyer confirms while present, instead of saving a card and charging it off-session afterwards. Recurring offers keep the SetupIntent they have always used. Part 2 then adds `offers.bump_offer_id`, resolves the bump with the same helpers the product checkout uses, and folds its amount into that same PaymentIntent — so one tickbox is one charge.

**Tech Stack:** Next.js 15 App Router (server actions, route handlers), Stripe (PaymentIntents, SetupIntents, Subscriptions), self-hosted Supabase (Postgres 15), vitest.

**Spec:** `docs/superpowers/specs/2026-09-08-offer-checkout-bump-design.md`

## Global Constraints

- **Stripe is LIVE in production.** Local runs against `sk_test_`. Integration tests self-skip via `describe.skipIf(!canRun)` when `STRIPE_SECRET_KEY` is not a test key or `SUPABASE_SERVICE_ROLE_KEY` is missing.
- **Never charge off-session for a one-time purchase.** Stripe refuses off-session card payments on India-issued cards without an RBI e-mandate, and 3 of the last 5 orders on this store are `buyer_country = IN`.
- **The browser sends an INDEX, never an id.** Every price and bump choice is an index into a list the server rebuilt from the database. Out of range **refuses**; it never falls back to a headline price.
- **Refusing beats silently dropping.** A bump that cannot be sold returns an error before any charge. Quietly discarding it charges for the base and ignores what the buyer ticked, with nothing on the receipt.
- **`store_created: "true"` and a readable `description` on every Stripe object we create.** This account is shared with five other apps; without them a charge cannot be told from theirs in the dashboard, in exports, or in Zapier.
- **`livemode: stripeMode() === "live"` on every order row.** Two test-mode rows have already counted as revenue once.
- **Named constraints only.** An unnamed CHECK is invisible in a diff, and this repo has twice shipped a feature the database then refused.
- **Migrations do not run on deploy.** There is no step in the `Dockerfile`. The Part 2 migration runs against production *before* the code ships.
- **Run the whole suite before each commit:** `npx vitest run`. Local Supabase must be up (`supabase start`).

## File Structure

| File | Responsibility | Part |
|---|---|---|
| `lib/checkout.ts` | `fulfilOffer` gains `prepaid`; `fulfilBump` unchanged and reused | 1 |
| `lib/offer-checkout.ts` | Chooses the intent type, resolves the bump, books the order | 1, 2 |
| `app/(store)/checkout/offer/actions.ts` | Passes `mode` through to the client | 1 |
| `components/checkout/offer-checkout-form.tsx` | Confirms payment or setup; renders the bump | 1, 2 |
| `app/(store)/checkout/offer/complete/route.ts` | Accepts either intent on the way back | 1 |
| `lib/post-purchase.ts` | `mintOfferLogin` accepts either intent | 1 |
| `supabase/migrations/0070_offer_bump.sql` | `bump_offer_id`, `bump_price_ids`, self-reference CHECK | 2 |
| `lib/store.ts` | `OFFER_COLUMNS` + `hydrateOffer` carry the new fields | 2 |
| `app/admin/offers/actions.ts` | `saveOffer` validates the bump slot | 2 |
| `components/admin/offer-form.tsx` | The Bump section | 2 |
| `app/(store)/checkout/offer/page.tsx` | Builds the `BumpSummary` for the form | 2 |

---

# PART 1 — a one-time offer charges on-session

### Task 1: `fulfilOffer` can grant without charging

**Files:**
- Modify: `lib/checkout.ts:672-777` (`fulfilOffer`)
- Test: `lib/fulfil-offer-prepaid.integration.test.ts` (create)

**Interfaces:**
- Produces: `fulfilOffer(args & { prepaid?: boolean })`. When `prepaid` is true and the offer is `one_time`, it creates no PaymentIntent and returns `{ paymentIntentId: undefined }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { fulfilOffer } from "@/lib/checkout";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { stripe } from "@/lib/stripe";

const canRun =
  !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!canRun)("a prepaid one-time offer (integration)", () => {
  it("grants without creating a second charge", async () => {
    const db = createServiceClient();
    const storeId = await getStoreId();
    const customer = await stripe().customers.create({ email: `prepaid_${Date.now()}@example.test` });

    const { data: order } = await db
      .from("orders")
      .insert({
        livemode: false,
        store_id: storeId,
        email: "prepaid@example.test",
        status: "paid",
        currency: "usd",
        subtotal_cents: 4700,
        total_cents: 4700,
        stripe_customer_id: customer.id,
      })
      .select("id")
      .single();

    const before = await stripe().paymentIntents.list({ customer: customer.id, limit: 100 });

    const res = await fulfilOffer({
      order: { id: order!.id as string, stripeCustomerId: customer.id },
      offer: {
        id: "00000000-0000-0000-0000-0000000000f1",
        name: "zz prepaid fixture",
        billingType: "one_time",
        priceCents: 4700,
        currency: "usd",
        trialDays: null,
      } as never,
      paymentMethodId: "pm_card_visa",
      prepaid: true,
    });

    const after = await stripe().paymentIntents.list({ customer: customer.id, limit: 100 });
    expect(res.paymentIntentId).toBeUndefined();
    expect(after.data.length).toBe(before.data.length);

    await db.from("orders").delete().eq("id", order!.id);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/fulfil-offer-prepaid.integration.test.ts`
Expected: FAIL — `prepaid` is not a known property, and a PaymentIntent is created.

- [ ] **Step 3: Implement**

In `lib/checkout.ts`, add to `fulfilOffer`'s argument type, directly below `idempotencyKey`:

```ts
  /**
   * Its money is already in the order's own payment.
   *
   * The offer checkout now charges a one-time offer on-session, in a
   * PaymentIntent the buyer confirms while they are present. Charging again
   * here would bill them twice for one purchase — and would do it
   * off-session, which is the thing that cannot happen on an Indian card.
   */
  prepaid?: boolean;
```

Then, immediately before `const charge = coupon` (currently line 754):

```ts
  // Already paid for in the order's own intent. Nothing to take.
  if (args.prepaid) return {};
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run lib/fulfil-offer-prepaid.integration.test.ts`
Expected: PASS

- [ ] **Step 5: Full suite, then commit**

```bash
npx vitest run
git add lib/checkout.ts lib/fulfil-offer-prepaid.integration.test.ts
git commit -m "Let fulfilOffer grant money that has already been taken"
```

---

### Task 2: a one-time offer opens a PaymentIntent

**Files:**
- Modify: `lib/offer-checkout.ts:22-24` (`StartResult`), `lib/offer-checkout.ts:148-170` (the intent)
- Modify: `app/(store)/checkout/offer/actions.ts:29,51`
- Test: `lib/offer-checkout-intent.integration.test.ts` (create)

**Interfaces:**
- Consumes: `immediateChargeCents(offer)` from `@/lib/offers`, `MIN_CHARGE_CENTS` from `@/lib/coupons`.
- Produces: `StartResult` = `{ ok: true; clientSecret: string; customerId: string; mode: "payment" | "setup" }`. The action returns `{ ok: true; clientSecret: string; mode: "payment" | "setup" }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterAll } from "vitest";
import { startOfferCheckout } from "@/lib/offer-checkout";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

const canRun =
  !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const APP = "00000000-0000-0000-0000-0000000000a1";
const made: string[] = [];
const users: string[] = [];

async function offerOf(billing: "one_time" | "recurring") {
  const db = createServiceClient();
  const id = crypto.randomUUID();
  made.push(id);
  const { error } = await db.from("offers").insert({
    id,
    store_id: await getStoreId(),
    key: `zz-intent-${id}`,
    name: "zz intent fixture",
    grant_type: "subscription",
    grant_app_id: APP,
    grant_entitlement_key: "content-engine",
    grant_channels: [],
    billing_type: billing,
    interval: billing === "recurring" ? "month" : null,
    trial_days: billing === "recurring" ? 7 : null,
    price_cents: 4700,
    currency: "usd",
    headline: "fixture",
    description: "fixture",
    active: false,
  });
  if (error) throw new Error(`fixture offer: ${error.message}`);
  // active:false keeps it off every storefront; startOfferCheckout needs it on.
  await db.from("offers").update({ active: true }).eq("id", id);
  return id;
}

async function member() {
  const db = createServiceClient();
  const email = `intent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.test`;
  const created = await db.auth.admin.createUser({ email, email_confirm: true });
  const userId = created.data.user!.id;
  users.push(userId);
  await db.from("users").insert({ id: userId, store_id: await getStoreId(), email });
  return { userId, email };
}

describe.skipIf(!canRun)("which intent an offer checkout opens (integration)", () => {
  it("charges a one-time offer on-session", async () => {
    const { userId, email } = await member();
    const offerId = await offerOf("one_time");
    const res = await startOfferCheckout({ userId, email, offerId });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.mode).toBe("payment");
    expect(res.clientSecret.startsWith("pi_")).toBe(true);
  });

  it("still saves a card for a trial, because $0 cannot be a payment", async () => {
    const { userId, email } = await member();
    const offerId = await offerOf("recurring");
    const res = await startOfferCheckout({ userId, email, offerId });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.mode).toBe("setup");
    expect(res.clientSecret.startsWith("seti_")).toBe(true);
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const id of made) await db.from("offers").delete().eq("id", id);
  for (const id of users) {
    await db.from("ownership").delete().eq("user_id", id);
    await db.from("users").delete().eq("id", id);
    await db.auth.admin.deleteUser(id);
  }
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/offer-checkout-intent.integration.test.ts`
Expected: FAIL — `res.mode` is undefined and the secret starts `seti_`.

- [ ] **Step 3: Widen `StartResult`**

`lib/offer-checkout.ts`, replace lines 22-24:

```ts
export type StartResult =
  | {
      ok: true;
      clientSecret: string;
      customerId: string;
      /**
       * Which Stripe object the form must confirm.
       *
       * A one-time offer takes money today, so the buyer confirms a payment
       * while they are present — no mandate is needed for a payment the
       * cardholder is there for. A recurring offer takes nothing today (a
       * trial is genuinely $0, and a $0 PaymentIntent is not a thing Stripe
       * will make), so the card is saved and the subscription bills itself.
       */
      mode: "payment" | "setup";
    }
  | { ok: false; error: string };
```

- [ ] **Step 4: Branch on billing type**

In `startOfferCheckout`, replace the `const si = await stripe().setupIntents.create({...})` block and the two lines that follow it with:

```ts
  // The metadata is identical on both objects: completeOfferCheckout reads the
  // same keys back whichever kind came back, and it is written by US rather
  // than copied out of the request.
  const metadata = {
    store_created: "true",
    storeId,
    userId: args.userId,
    offerId: offer.id,
    offerPriceId:
      args.priceChoice !== undefined ? (priceForChoice(shown, args.priceChoice)?.id ?? "") : "",
    // The code, not the discount. An amount written here would be an amount
    // the browser could have influenced at preview time.
    couponCode: coupon?.code ?? "",
    // Whether THIS checkout created the account. Read on the way back to
    // decide whether a session may be handed out — see mintOfferLogin.
    newAccount: args.isNewAccount ? "true" : "false",
  };
  const description = `${offer.name} — ${await getStoreName()}`;

  // A one-time offer is charged HERE, on-session, for the amount on the
  // button. It used to save the card and charge it afterwards off-session,
  // which Stripe refuses outright on a card issued in India without an RBI
  // e-mandate — so the buyer was charged nothing and granted nothing, with no
  // error anybody saw. `setup_future_usage` keeps the card on file, which is
  // what the library's one-tap standing offer needs.
  if (sold.billingType === "one_time") {
    const gross = immediateChargeCents(sold);
    const discount = coupon ? Math.min(coupon.discountCents, Math.max(0, gross - MIN_CHARGE_CENTS)) : 0;
    const pi = await stripe().paymentIntents.create({
      amount: gross - discount,
      currency: sold.currency,
      customer: customerId,
      setup_future_usage: "off_session",
      automatic_payment_methods: { enabled: true },
      description,
      metadata: { ...metadata, discountCents: String(discount) },
    });
    if (!pi.client_secret) return { ok: false, error: "Could not start checkout." };
    return { ok: true, clientSecret: pi.client_secret, customerId, mode: "payment" };
  }

  const si = await stripe().setupIntents.create({
    customer: customerId,
    usage: "off_session",
    automatic_payment_methods: { enabled: true },
    description,
    metadata,
  });
  if (!si.client_secret) return { ok: false, error: "Could not start checkout." };
  return { ok: true, clientSecret: si.client_secret, customerId, mode: "setup" };
```

Add `sold` above it, directly after the coupon block, so the trial a coupon grants is what decides the amount:

```ts
  const sold = offerWithCouponTrial(
    args.priceChoice !== undefined
      ? offerAtPrice(offer, priceForChoice(shown, args.priceChoice)!)
      : offer,
    coupon,
  );
```

Add `getStoreName` to the `@/lib/store` import and `MIN_CHARGE_CENTS` is already imported from `@/lib/coupons`.

- [ ] **Step 5: Pass `mode` through the action**

`app/(store)/checkout/offer/actions.ts`, line 29 — widen the return type:

```ts
): Promise<{ ok: true; clientSecret: string; mode: "payment" | "setup" } | { ok: false; error: string; code?: string }> {
```

and line 51:

```ts
  return { ok: true, clientSecret: res.clientSecret, mode: res.mode };
```

- [ ] **Step 6: Run it and watch it pass**

Run: `npx vitest run lib/offer-checkout-intent.integration.test.ts`
Expected: PASS — both cases.

- [ ] **Step 7: Full suite, then commit**

```bash
npx vitest run
git add lib/offer-checkout.ts "app/(store)/checkout/offer/actions.ts" lib/offer-checkout-intent.integration.test.ts
git commit -m "Charge a one-time offer while the buyer is present"
```

---

### Task 3: the return trip accepts either intent

**Files:**
- Modify: `lib/offer-checkout.ts:179-190` (`completeOfferCheckout`) and its order insert
- Test: `lib/offer-checkout-complete.integration.test.ts` (create)

**Interfaces:**
- Consumes: `fulfilOffer({ prepaid })` from Task 1; `StartResult.mode` from Task 2.
- Produces: `completeOfferCheckout(intentId: string, country?: string)` accepting an id beginning `pi_` or `seti_`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { completeOfferCheckout } from "@/lib/offer-checkout";

const canRun =
  !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!canRun)("what completeOfferCheckout will accept", () => {
  it("refuses an id that is neither kind of intent rather than guessing", async () => {
    expect(await completeOfferCheckout("cus_notanintent")).toEqual({
      ok: false,
      error: "unknown_intent",
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/offer-checkout-complete.integration.test.ts`
Expected: FAIL — it calls `setupIntents.retrieve` and throws a Stripe error.

- [ ] **Step 3: Implement**

Replace the first three lines of `completeOfferCheckout`'s body:

```ts
  // Either kind. A one-time offer is paid for on-session, so the money is
  // already taken by the time the buyer lands back here; a recurring one saved
  // a card and its subscription is created below. Anything else is refused
  // rather than guessed at — a wrong retrieve would throw on a completed
  // purchase, which is the worst outcome available.
  const paid = setupIntentId.startsWith("pi_");
  if (!paid && !setupIntentId.startsWith("seti_")) {
    return { ok: false, error: "unknown_intent" };
  }
  const si = paid
    ? await stripe().paymentIntents.retrieve(setupIntentId)
    : await stripe().setupIntents.retrieve(setupIntentId);
  if (si.status !== "succeeded") return { ok: false, error: "card_not_saved" };
```

In the order insert, replace `stripe_customer_id: customerId,` with:

```ts
      stripe_customer_id: customerId,
      // Which object took the money, so the ledger points at the real charge.
      stripe_payment_intent_id: paid ? si.id : null,
      stripe_setup_intent_id: paid ? null : si.id,
```

**And book what the card was actually charged.** `completeOfferCheckout`
recomputes `gross`, `discount` and `chargeNow` from the offer as it stands
*now*. On the payment path that number can differ from what the intent
authorised — a coupon that expired in between would recompute a higher total
than the card ever saw, and the order would disagree with the charge. Replace
`total_cents: chargeNow,` with:

```ts
      // What the card was actually charged, not what it would cost if bought
      // again this second. The intent is the receipt; a recomputed figure can
      // drift from it when a coupon dies between opening the form and paying.
      total_cents: paid ? si.amount : chargeNow,
```

Then pass the flag to fulfilment — replace `idempotencyKey: \`offerco_${setupIntentId}_${offer.id}\`,` with:

```ts
      idempotencyKey: `offerco_${setupIntentId}_${offer.id}`,
      // The money is in the intent the buyer just confirmed.
      prepaid: paid,
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run lib/offer-checkout-complete.integration.test.ts`
Expected: PASS

- [ ] **Step 5: Full suite, then commit**

```bash
npx vitest run
git add lib/offer-checkout.ts lib/offer-checkout-complete.integration.test.ts
git commit -m "Read back whichever intent the offer checkout opened"
```

---

### Task 4: the buyer is still signed in on the way back

**Files:**
- Modify: `lib/post-purchase.ts:97-110` (`mintOfferLogin`)
- Modify: `app/(store)/checkout/offer/complete/route.ts:22-30`
- Test: `lib/mint-offer-login.test.ts` (create)

**Interfaces:**
- Produces: `mintOfferLogin(intentId, clientSecret)` accepting `pi_` and `seti_` ids.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { mintOfferLogin } from "@/lib/post-purchase";

describe("mintOfferLogin", () => {
  it("refuses an id that is neither intent, without calling Stripe", async () => {
    expect(await mintOfferLogin("cus_nope", "secret")).toBeNull();
  });

  it("refuses when there is no client secret to compare", async () => {
    expect(await mintOfferLogin("pi_123", null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/mint-offer-login.test.ts`
Expected: FAIL on the first case — it calls `setupIntents.retrieve("cus_nope")`.

- [ ] **Step 3: Implement**

`lib/post-purchase.ts`, replace lines 101-109:

```ts
  if (!setupIntentId || !clientSecret) return null;
  const paid = setupIntentId.startsWith("pi_");
  if (!paid && !setupIntentId.startsWith("seti_")) return null;

  let si;
  try {
    si = paid
      ? await stripe().paymentIntents.retrieve(setupIntentId)
      : await stripe().setupIntents.retrieve(setupIntentId);
  } catch {
    return null;
  }
  if (si.client_secret !== clientSecret || si.status !== "succeeded") return null;
```

`app/(store)/checkout/offer/complete/route.ts`, replace lines 22-27:

```ts
  // Either kind, because a one-time offer is now paid for rather than saved.
  const setupIntentId =
    url.searchParams.get("payment_intent") ?? url.searchParams.get("setup_intent");
  const clientSecret =
    url.searchParams.get("payment_intent_client_secret") ??
    url.searchParams.get("setup_intent_client_secret");
  const redirectStatus = url.searchParams.get("redirect_status");
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run lib/mint-offer-login.test.ts`
Expected: PASS

- [ ] **Step 5: Full suite, then commit**

```bash
npx vitest run
git add lib/post-purchase.ts "app/(store)/checkout/offer/complete/route.ts" lib/mint-offer-login.test.ts
git commit -m "Sign a one-time buyer in on the way back too"
```

---

### Task 5: the form confirms the right thing

**Files:**
- Modify: `components/checkout/offer-checkout-form.tsx:226-232`
- Test: `components/checkout/offer-confirm-mode.test.ts` (create)

**Interfaces:**
- Consumes: the action's `{ ok: true; clientSecret; mode }` from Task 2.

- [ ] **Step 1: Write the failing test**

A source assertion, because the confirm call cannot be driven without a real Stripe Elements instance. Scoped to the call, not the file, so a comment mentioning `confirmSetup` cannot satisfy it.

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("components/checkout/offer-checkout-form.tsx", "utf8");

describe("the offer form confirms what the server opened", () => {
  it("branches on mode rather than always confirming a setup", () => {
    expect(src).toMatch(/res\.mode === "payment"/);
    expect(src).toMatch(/stripe\.confirmPayment\(/);
  });

  it("still has a setup path, for the trial that charges nothing today", () => {
    expect(src).toMatch(/stripe\.confirmSetup\(/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run components/checkout/offer-confirm-mode.test.ts`
Expected: FAIL — no `confirmPayment`, no branch on `mode`.

- [ ] **Step 3: Implement**

Replace lines 226-232 of `components/checkout/offer-checkout-form.tsx`:

```ts
    // A one-time offer takes money now, so the buyer confirms a payment while
    // they are here. A trial takes nothing today, so its card is saved and the
    // subscription bills itself. Same return_url either way — the route reads
    // whichever pair of query parameters Stripe sends back.
    const confirmParams = { return_url: `${window.location.origin}/checkout/offer/complete` };
    const { error: confirmError } =
      res.mode === "payment"
        ? await stripe.confirmPayment({ elements, clientSecret: res.clientSecret, confirmParams })
        : await stripe.confirmSetup({ elements, clientSecret: res.clientSecret, confirmParams });
    // Only reached if confirmation didn't redirect (i.e. something failed).
    if (confirmError) setError(confirmError.message ?? "Could not take payment");
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run components/checkout/offer-confirm-mode.test.ts`
Expected: PASS

- [ ] **Step 5: Full suite, then commit**

```bash
npx vitest run
git add components/checkout/offer-checkout-form.tsx components/checkout/offer-confirm-mode.test.ts
git commit -m "Confirm a payment when there is money to take"
```

---

### Task 6: end to end, one charge, granted once

**Files:**
- Test: `lib/offer-checkout-onetime.integration.test.ts` (create)

**Interfaces:**
- Consumes: everything from Tasks 1-5.

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, afterAll } from "vitest";
import { startOfferCheckout, completeOfferCheckout } from "@/lib/offer-checkout";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

const canRun =
  !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const APP = "00000000-0000-0000-0000-0000000000a1";
const made: string[] = [];
const users: string[] = [];

describe.skipIf(!canRun)("buying a one-time offer (integration)", () => {
  it("takes one on-session payment and grants exactly once", async () => {
    const db = createServiceClient();
    const storeId = await getStoreId();

    const offerId = crypto.randomUUID();
    made.push(offerId);
    const { error } = await db.from("offers").insert({
      id: offerId,
      store_id: storeId,
      key: `zz-onetime-${offerId}`,
      name: "zz one-time fixture",
      grant_type: "subscription",
      grant_app_id: APP,
      grant_entitlement_key: "content-engine",
      grant_channels: [],
      billing_type: "one_time",
      trial_days: null,
      price_cents: 4700,
      currency: "usd",
      headline: "fixture",
      description: "fixture",
    });
    if (error) throw new Error(`fixture offer: ${error.message}`);

    const email = `onetime_${Date.now()}@example.test`;
    const created = await db.auth.admin.createUser({ email, email_confirm: true });
    const userId = created.data.user!.id;
    users.push(userId);
    await db.from("users").insert({ id: userId, store_id: storeId, email });

    const start = await startOfferCheckout({ userId, email, offerId });
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    expect(start.mode).toBe("payment");

    const piId = start.clientSecret.split("_secret_")[0];
    await stripe().paymentIntents.confirm(piId, {
      payment_method: "pm_card_visa",
      return_url: "http://localhost:3000/checkout/offer/complete",
    });

    expect(await completeOfferCheckout(piId)).toEqual({ ok: true });

    const own = await db.from("ownership").select("status").eq("user_id", userId);
    expect(own.data).toHaveLength(1);
    expect(own.data![0].status).toBe("active");

    const orders = await db
      .from("orders")
      .select("total_cents, stripe_payment_intent_id, stripe_setup_intent_id")
      .eq("user_id", userId);
    expect(orders.data).toHaveLength(1);
    expect(orders.data![0].total_cents).toBe(4700);
    expect(orders.data![0].stripe_payment_intent_id).toBe(piId);
    expect(orders.data![0].stripe_setup_intent_id).toBeNull();

    // The buyer refreshes the return page. Granting twice would be the bug.
    expect(await completeOfferCheckout(piId)).toEqual({ ok: true });
    const again = await db.from("ownership").select("id").eq("user_id", userId);
    expect(again.data).toHaveLength(1);

    // And exactly one charge exists for this purchase.
    const pi = await stripe().paymentIntents.retrieve(piId);
    expect(pi.amount).toBe(4700);
    expect(pi.status).toBe("succeeded");
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const id of users) {
    await db.from("ownership").delete().eq("user_id", id);
    const { data: orders } = await db.from("orders").select("id").eq("user_id", id);
    for (const o of orders ?? []) await db.from("order_items").delete().eq("order_id", o.id);
    await db.from("orders").delete().eq("user_id", id);
    await db.from("users").delete().eq("id", id);
    await db.auth.admin.deleteUser(id);
  }
  for (const id of made) await db.from("offers").delete().eq("id", id);
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run lib/offer-checkout-onetime.integration.test.ts`
Expected: PASS. If it fails, the failure is in Tasks 1-5, not in this test — fix there.

- [ ] **Step 3: Full suite, then commit**

```bash
npx vitest run
git add lib/offer-checkout-onetime.integration.test.ts
git commit -m "Pin the one-time offer checkout end to end"
```

---

# PART 2 — the bump

**Do not start Part 2 until every task above is committed and `npx vitest run` is green.** Part 2 folds an amount into the PaymentIntent Part 1 introduced; without it there is no on-session intent to fold into, and the bump would be charged off-session — the defect this whole plan removes.

### Task 7: an offer can name a bump

**Files:**
- Create: `supabase/migrations/0070_offer_bump.sql` (if `prominence` landed first, use the next free number)
- Modify: `lib/store.ts:64` (`OFFER_COLUMNS`), `lib/types.ts:143` (after `pagePriceIds`)
- Test: `lib/offer-bump-schema.integration.test.ts` (create)

**Interfaces:**
- Produces: `Offer.bumpOfferId: string | null` and `Offer.bumpPriceIds: string[]`, hydrated automatically by `camelize` once the columns are in `OFFER_COLUMNS`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterAll } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId, getOffer } from "@/lib/store";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "00000000-0000-0000-0000-0000000000a1";
const made: string[] = [];

async function fixture(extra: Record<string, unknown> = {}) {
  const db = createServiceClient();
  const id = crypto.randomUUID();
  made.push(id);
  const { error } = await db.from("offers").insert({
    id,
    store_id: await getStoreId(),
    key: `zz-bump-${id}`,
    name: "zz bump fixture",
    grant_type: "subscription",
    grant_app_id: APP,
    grant_entitlement_key: "content-engine",
    grant_channels: [],
    billing_type: "one_time",
    price_cents: 2900,
    currency: "usd",
    headline: "fixture",
    description: "fixture",
    ...extra,
  });
  return { id, error };
}

describe.skipIf(!canRun)("an offer's bump slot (integration)", () => {
  it("carries a bump offer and the prices to show", async () => {
    const target = await fixture();
    const host = await fixture({ bump_offer_id: target.id, bump_price_ids: [] });
    expect(host.error).toBeNull();
    const read = await getOffer(host.id);
    expect(read?.bumpOfferId).toBe(target.id);
    expect(read?.bumpPriceIds).toEqual([]);
  });

  it("refuses to bump itself", async () => {
    // Written because a CHECK that silently is not there looks exactly like
    // one that is. A self-bump would recurse in the charge path.
    const db = createServiceClient();
    const made1 = await fixture();
    const { error } = await db.from("offers").update({ bump_offer_id: made1.id }).eq("id", made1.id);
    expect(error?.message ?? "").toContain("offers_bump_not_self");
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const id of made) await db.from("offers").update({ bump_offer_id: null }).eq("id", id);
  for (const id of made) await db.from("offers").delete().eq("id", id);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/offer-bump-schema.integration.test.ts`
Expected: FAIL — `bump_offer_id` does not exist.

- [ ] **Step 3: Write the migration**

`supabase/migrations/0070_offer_bump.sql`:

```sql
-- An offer's checkout can carry a bump, the way a product's always could.
--
-- The slot lived on `products` alone, so an offer sold on its own page had no
-- way to offer anything alongside it. `bump_price_ids` mirrors the product
-- column of the same name: which of the bump offer's prices THIS placement
-- shows, because one offer may be sold at three prices in one place and one
-- price in another.
--
-- No `bump_product_id`. Products have one; an offer that grants a product is
-- the thing being sold here, so a second nullable target would mean a second
-- guard and a second branch in the charge path for a case nobody has.
alter table offers
  add column if not exists bump_offer_id uuid references offers(id) on delete set null,
  add column if not exists bump_price_ids uuid[] not null default '{}';

comment on column offers.bump_offer_id is
  'An offer shown as a tickbox on this offer''s checkout. Must be one-time: a recurring bump would mean creating a subscription from a saved card afterwards, which Stripe refuses on an India-issued card without an e-mandate.';

-- Named, because an unnamed CHECK is invisible in a diff and this repo has
-- twice shipped a feature the database then refused.
alter table offers
  drop constraint if exists offers_bump_not_self;
alter table offers
  add constraint offers_bump_not_self
  check (bump_offer_id is null or bump_offer_id <> id);
```

- [ ] **Step 4: Apply it locally**

Run: `supabase migration up` (or `supabase db reset` if the local database has drifted)
Expected: applies with no error.

- [ ] **Step 5: Add the columns to the read path**

`lib/store.ts:64` — add `bump_offer_id, bump_price_ids, ` immediately after `page_price_ids, `.

`lib/types.ts`, immediately after `pagePriceIds: string[];`:

```ts
  /** An offer shown as a tickbox on this offer's checkout. */
  bumpOfferId: string | null;
  /** Which of the bump offer's prices this placement shows. Empty = headline. */
  bumpPriceIds: string[];
```

- [ ] **Step 6: Run it and watch it pass**

Run: `npx vitest run lib/offer-bump-schema.integration.test.ts`
Expected: PASS

- [ ] **Step 7: Full suite, then commit**

```bash
npx vitest run
git add supabase/migrations/0070_offer_bump.sql lib/store.ts lib/types.ts lib/offer-bump-schema.integration.test.ts
git commit -m "Give an offer somewhere to name its bump"
```

---

### Task 8: the admin cannot configure a bump that will fail at the till

**Files:**
- Modify: `app/admin/offers/actions.ts` (`schema` around line 51, and the `OfferInput` build around line 164)
- Test: `lib/offer-bump-validation.test.ts` (create)

**Interfaces:**
- Produces: `bumpSlotError(bump: { id: string; billingType: string; active: boolean } | null, hostId: string): string | null` exported from `lib/offers.ts` — `null` when the slot is allowed.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { bumpSlotError } from "@/lib/offers";

const one = { id: "b1", billingType: "one_time", active: true };

describe("what may sit in an offer's bump slot", () => {
  it("allows a live one-time offer", () => {
    expect(bumpSlotError(one, "host")).toBeNull();
  });

  it("allows an empty slot", () => {
    expect(bumpSlotError(null, "host")).toBeNull();
  });

  it("refuses a recurring offer, and says why", () => {
    // A recurring bump means creating a subscription from a saved card after
    // the fact — off-session, which Stripe refuses on an Indian card. Better
    // refused in the form than at the till.
    const msg = bumpSlotError({ id: "b1", billingType: "recurring", active: true }, "host");
    expect(msg).toMatch(/one-time/i);
  });

  it("refuses an offer that is not on sale", () => {
    expect(bumpSlotError({ ...one, active: false }, "host")).toMatch(/not active/i);
  });

  it("refuses an offer bumping itself", () => {
    expect(bumpSlotError({ ...one, id: "host" }, "host")).toMatch(/itself/i);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/offer-bump-validation.test.ts`
Expected: FAIL — `bumpSlotError` is not exported.

- [ ] **Step 3: Implement**

Append to `lib/offers.ts`:

```ts
/**
 * Whether an offer may sit in another offer's bump slot.
 *
 * Checked when the admin saves rather than when a buyer pays. A slot that can
 * only fail is a slot that fails in front of a customer with a card in their
 * hand, and the message they would see explains nothing.
 */
export function bumpSlotError(
  bump: { id: string; billingType: string; active: boolean } | null,
  hostId: string,
): string | null {
  if (!bump) return null;
  if (bump.id === hostId) return "An offer cannot bump itself.";
  if (!bump.active) return "That offer is not active, so it cannot be offered as a bump.";
  if (bump.billingType !== "one_time") {
    return "A bump must be a one-time offer. A recurring one would have to be charged after the payment, which cards issued in India refuse.";
  }
  return null;
}
```

In `app/admin/offers/actions.ts`, add to the zod `schema` beside `pageAltOfferId`:

```ts
    bumpOfferId: z.string().trim().optional().default(""),
```

and immediately after the `declared` channel filtering (after `v.grantChannels = v.grantChannels.filter(...)`):

```ts
  // Refuse a bump that could only fail when somebody tries to buy it.
  if (v.bumpOfferId) {
    const bump = await getOffer(v.bumpOfferId);
    const problem = bumpSlotError(
      bump ? { id: bump.id, billingType: bump.billingType, active: bump.active } : null,
      v.id ?? "",
    );
    if (!bump) return { error: "That bump offer no longer exists." };
    if (problem) return { error: problem };
  }
```

and add `bumpOfferId: v.bumpOfferId || null,` to the `OfferInput` object. Import `bumpSlotError` from `@/lib/offers` and `getOffer` from `@/lib/store` if not already imported.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run lib/offer-bump-validation.test.ts`
Expected: PASS

- [ ] **Step 5: Full suite, then commit**

```bash
npx vitest run
git add lib/offers.ts app/admin/offers/actions.ts lib/offer-bump-validation.test.ts
git commit -m "Refuse a bump slot that could only fail at the till"
```

---

### Task 9: the bump is resolved and folded into the same payment

**Files:**
- Modify: `lib/offer-checkout.ts` — `startOfferCheckout` args and the PaymentIntent from Task 2
- Test: `lib/offer-bump-charge.integration.test.ts` (create)

**Interfaces:**
- Consumes: `shouldShowOffer` and `offerAtPrice` from `@/lib/offers`, `shownPrices` and `priceForChoice` from `@/lib/offer-prices`, `offerAsSoldTo` from `@/lib/trial-history`, `ownershipFor` from `@/lib/checkout`.
- Produces: `startOfferCheckout(args & { bumpChoice?: number | "none" })`. The PaymentIntent carries `bumpOfferId` and `bumpPrepaid: "true"` when a bump was folded in.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterAll } from "vitest";
import { startOfferCheckout } from "@/lib/offer-checkout";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

const canRun =
  !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "00000000-0000-0000-0000-0000000000a1";
const made: string[] = [];
const users: string[] = [];

async function offerOf(cents: number, extra: Record<string, unknown> = {}) {
  const db = createServiceClient();
  const id = crypto.randomUUID();
  made.push(id);
  const { error } = await db.from("offers").insert({
    id,
    store_id: await getStoreId(),
    key: `zz-bc-${id}`,
    name: "zz bump-charge fixture",
    grant_type: "subscription",
    grant_app_id: APP,
    grant_entitlement_key: "content-engine",
    grant_channels: [],
    billing_type: "one_time",
    price_cents: cents,
    currency: "usd",
    headline: "fixture",
    description: "fixture",
    ...extra,
  });
  if (error) throw new Error(`fixture: ${error.message}`);
  return id;
}

async function member() {
  const db = createServiceClient();
  const email = `bc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.test`;
  const created = await db.auth.admin.createUser({ email, email_confirm: true });
  const userId = created.data.user!.id;
  users.push(userId);
  await db.from("users").insert({ id: userId, store_id: await getStoreId(), email });
  return { userId, email };
}

describe.skipIf(!canRun)("a bump on an offer's checkout (integration)", () => {
  it("authorises ONE payment for both", async () => {
    const bumpId = await offerOf(2900);
    const hostId = await offerOf(4700, { bump_offer_id: bumpId });
    const { userId, email } = await member();

    const res = await startOfferCheckout({ userId, email, offerId: hostId, bumpChoice: 0 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const pi = await stripe().paymentIntents.retrieve(res.clientSecret.split("_secret_")[0]);
    expect(pi.amount).toBe(7600);
    expect(pi.metadata.bumpOfferId).toBe(bumpId);
    expect(pi.metadata.bumpPrepaid).toBe("true");
  });

  it("charges the offer alone when the bump is declined", async () => {
    const bumpId = await offerOf(2900);
    const hostId = await offerOf(4700, { bump_offer_id: bumpId });
    const { userId, email } = await member();

    const res = await startOfferCheckout({ userId, email, offerId: hostId, bumpChoice: "none" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const pi = await stripe().paymentIntents.retrieve(res.clientSecret.split("_secret_")[0]);
    expect(pi.amount).toBe(4700);
    expect(pi.metadata.bumpOfferId).toBe("");
  });

  it("refuses an index that names nothing rather than charging the headline price", async () => {
    const bumpId = await offerOf(2900);
    const hostId = await offerOf(4700, { bump_offer_id: bumpId });
    const { userId, email } = await member();
    const res = await startOfferCheckout({ userId, email, offerId: hostId, bumpChoice: 9 });
    expect(res.ok).toBe(false);
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const id of users) {
    await db.from("ownership").delete().eq("user_id", id);
    await db.from("users").delete().eq("id", id);
    await db.auth.admin.deleteUser(id);
  }
  for (const id of made) await db.from("offers").update({ bump_offer_id: null }).eq("id", id);
  for (const id of made) await db.from("offers").delete().eq("id", id);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/offer-bump-charge.integration.test.ts`
Expected: FAIL — `bumpChoice` is not accepted and the amount is 4700.

- [ ] **Step 3: Accept the choice**

Add to `startOfferCheckout`'s argument type:

```ts
  /** Which bump price they ticked — an INDEX into the list the page drew. */
  bumpChoice?: number | "none";
```

- [ ] **Step 4: Resolve the bump**

In `startOfferCheckout`, immediately after `const owned = await ownershipFor(args.userId);` and its eligibility check, add:

```ts
  // The bump, resolved by the same rules the product checkout uses — and with
  // the same helpers, so display and fulfilment cannot disagree.
  let bumpOffer: Offer | null = null;
  if (args.bumpChoice !== undefined && args.bumpChoice !== "none" && offer.bumpOfferId) {
    const shownBump = await getOffer(offer.bumpOfferId);
    // The options come from THIS offer's placement, never from the request.
    const options = shownBump ? shownPrices(shownBump.prices, offer.bumpPriceIds ?? []) : [];
    const price = priceForChoice(options, args.bumpChoice);
    // Out of range REFUSES. Charging somebody for a thing they did not choose
    // is the failure this rule exists to prevent.
    if (!price || !shownBump) {
      return { ok: false, error: "That add-on option is no longer available. Choose another and try again." };
    }
    const picked = offerAtPrice(shownBump, price);
    const asSold = await offerAsSoldTo(args.email, picked);
    if (!shouldShowOffer(asSold, owned)) {
      // Refuse rather than drop it silently: quietly discarding it charges for
      // the offer and ignores what they ticked, with nothing on the receipt.
      return { ok: false, error: "You already have the add-on you selected, so it can't be added again. Untick it to continue." };
    }
    if (asSold.billingType !== "one_time") {
      return { ok: false, error: "That add-on can't be bought here." };
    }
    bumpOffer = asSold;
  }
```

Import `shouldShowOffer` and `offerAtPrice` from `@/lib/offers`, `shownPrices` from `@/lib/offer-prices`, `offerAsSoldTo` from `@/lib/trial-history`, and `type Offer` from `@/lib/types`.

- [ ] **Step 5: Fold it into the payment**

In the `if (sold.billingType === "one_time")` block from Task 2, replace the `amount` and `metadata` lines:

```ts
    // One charge, on-session, for the amount on the button. A second charge
    // afterwards is what Stripe refuses on an India-issued card without an
    // e-mandate — and it would also mean the figure the buyer agreed to and
    // the figure their card saw were never the same number.
    const bumpNowCents = bumpOffer ? immediateChargeCents(bumpOffer) : 0;
    const pi = await stripe().paymentIntents.create({
      amount: gross - discount + bumpNowCents,
      currency: sold.currency,
      customer: customerId,
      setup_future_usage: "off_session",
      automatic_payment_methods: { enabled: true },
      description,
      metadata: {
        ...metadata,
        discountCents: String(discount),
        bumpOfferId: bumpOffer?.id ?? "",
        // Its money is in THIS intent, so fulfilment grants it and charges
        // nothing. Written by us, read by us.
        bumpPrepaid: bumpNowCents > 0 ? "true" : "",
      },
    });
```

- [ ] **Step 6: Run it and watch it pass**

Run: `npx vitest run lib/offer-bump-charge.integration.test.ts`
Expected: PASS — all three.

- [ ] **Step 7: Full suite, then commit**

```bash
npx vitest run
git add lib/offer-checkout.ts lib/offer-bump-charge.integration.test.ts
git commit -m "Fold an offer's bump into the offer's own payment"
```

---

### Task 10: the bump is granted and recorded

**Files:**
- Modify: `lib/offer-checkout.ts` — `completeOfferCheckout`, after `grantOfferOwnership`
- Test: extended in Task 12's end-to-end test

**Interfaces:**
- Consumes: `fulfilBump` from `@/lib/checkout` (already exported; takes `orderId, storeId, userId, email, stripeCustomerId, offerId, paymentMethodId, prepaid, paidByIntentId`).

- [ ] **Step 1: Implement**

In `completeOfferCheckout`, immediately after the existing `await db.from("order_items").insert({...})` call:

```ts
  // The bump the buyer ticked, whose money is already in the intent above.
  // fulfilBump is the same function the product checkout uses — it grants,
  // writes exactly one order line however many times it runs, and charges
  // nothing when prepaid.
  const bumpOfferId = si.metadata?.bumpOfferId ?? "";
  if (bumpOfferId) {
    await fulfilBump({
      orderId: order.id as string,
      storeId,
      userId,
      email,
      stripeCustomerId: customerId,
      offerId: bumpOfferId,
      paymentMethodId: pm,
      prepaid: si.metadata?.bumpPrepaid === "true",
      paidByIntentId: paid ? si.id : null,
    });
  }
```

Import `fulfilBump` from `@/lib/checkout`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Full suite, then commit**

```bash
npx vitest run
git add lib/offer-checkout.ts
git commit -m "Grant the bump the offer's payment already covered"
```

---

### Task 11: the buyer can see and tick it

**Files:**
- Modify: `app/(store)/checkout/offer/page.tsx` (build the summary, pass it down)
- Modify: `components/checkout/offer-checkout-form.tsx` (render it, post the index)
- Test: `components/checkout/offer-bump-render.test.ts` (create)

**Interfaces:**
- Consumes: `OrderBump` from `@/components/checkout/order-bump` and `BumpSummary` from `@/components/checkout/checkout-types`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const page = readFileSync("app/(store)/checkout/offer/page.tsx", "utf8");
const form = readFileSync("components/checkout/offer-checkout-form.tsx", "utf8");

describe("the offer checkout shows its bump", () => {
  it("builds the bump from the offer's own placement, not from the request", () => {
    expect(page).toMatch(/bumpOfferId/);
    expect(page).toMatch(/shownPrices\(/);
  });

  it("renders the shared component rather than a second copy of one", () => {
    expect(form).toMatch(/OrderBump/);
  });

  it("posts the choice to the server", () => {
    expect(form).toMatch(/bumpChoice/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run components/checkout/offer-bump-render.test.ts`
Expected: FAIL — no bump anywhere in either file.

- [ ] **Step 3: Build the summary on the page**

In `app/(store)/checkout/offer/page.tsx`, after the offer is resolved and before the `<OfferCheckoutForm .../>` render:

```ts
  // The bump this offer places, priced from its own placement. Resolved on the
  // server so the page and the charge are built from the same list — the form
  // posts an index into it and nothing else.
  const bumpRaw = offer.bumpOfferId ? await getOffer(offer.bumpOfferId) : null;
  const bumpEligible = bumpRaw && shouldShowOffer(bumpRaw, owned) ? bumpRaw : null;
  const bumpOptions = bumpEligible
    ? shownPrices(bumpEligible.prices, offer.bumpPriceIds ?? []).map((p, i) => ({
        index: i,
        offerId: bumpEligible.id,
        headline: bumpEligible.bumpHeadline ?? bumpEligible.headline,
        description: bumpEligible.bumpDescription ?? bumpEligible.description,
        bullets: bumpEligible.bumpBullets ?? [],
        priceCents: p.priceCents,
        currency: bumpEligible.currency,
        acceptLabel: bumpEligible.acceptLabel,
      }))
    : [];
```

and pass `bumpOptions={bumpOptions}` to `<OfferCheckoutForm />`. Import `shouldShowOffer` from `@/lib/offers` and `shownPrices` from `@/lib/offer-prices`.

- [ ] **Step 4: Render and post it**

In `components/checkout/offer-checkout-form.tsx`:

Add to the props type:

```ts
  bumpOptions?: {
    index: number;
    offerId: string;
    headline: string;
    description: string | null;
    bullets: string[];
    priceCents: number;
    currency: string;
    acceptLabel: string;
  }[];
```

with `bumpOptions = []` in the destructure. Add the state beside the existing
`pick`:

```ts
  // "none" until they tick it. An index once they have — the same shape the
  // price switch posts, because the server reads both as positions in a list
  // it rebuilt rather than as anything the browser named.
  const [bumpPick, setBumpPick] = useState<number | "none">("none");
```

Render it directly above the pay button:

```tsx
      {bumpOptions.length > 0 && (
        <OrderBump
          options={bumpOptions}
          chosen={bumpPick}
          onChoose={setBumpPick}
        />
      )}
```

Pass it into the action call — add a final argument to `startOffer(...)`:

```ts
      bumpPick,
```

Then in `app/(store)/checkout/offer/actions.ts`, take it as a parameter typed
`number | "none"` and hand it to `startOfferCheckout` as `bumpChoice`.

**Check `OrderBump`'s actual prop names before writing this** — read
`components/checkout/order-bump.tsx` and match them. If they differ from
`options` / `chosen` / `onChoose`, use the real ones rather than adding an
adapter; a second shape for one component is how the product and offer
checkouts start to drift.

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run components/checkout/offer-bump-render.test.ts`
Expected: PASS

- [ ] **Step 6: Screenshot it**

Follow the loop in the `visual-verification-loop` memory: render the form against `.next/static/css/*.css` in a throwaway vitest file, screenshot it headless, and look at it. Reading the JSX is not verification — a capped list and a stray margin both read correctly in source.

- [ ] **Step 7: Full suite, then commit**

```bash
npx vitest run
git add "app/(store)/checkout/offer/page.tsx" components/checkout/offer-checkout-form.tsx "app/(store)/checkout/offer/actions.ts" components/checkout/offer-bump-render.test.ts
git commit -m "Show the bump on an offer's checkout"
```

---

### Task 12: the admin can set it, and it works end to end

**Files:**
- Modify: `components/admin/offer-form.tsx` — a Bump section beside the existing bump *copy* fields
- Test: `lib/offer-bump-e2e.integration.test.ts` (create)

- [ ] **Step 1: Add the control**

The form already receives the store's other offers for the `pageAltOfferId`
select (it renders `{o.active ? "" : " (draft)"}` around line 406) — reuse that
same list. Beside the existing `bumpHeadline` / `bumpDescription` fields:

```tsx
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Bump on this offer's checkout</span>
          <select name="bumpOfferId" defaultValue={offer?.bumpOfferId ?? ""} className={input}>
            <option value="">No bump</option>
            {offers
              .filter((o) => o.id !== offer?.id && o.active && o.billingType === "one_time")
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
          </select>
          <span className="text-xs text-muted">
            Shown as a tickbox on this offer&rsquo;s checkout and charged in the same
            payment. One-time offers only — a recurring one would have to be charged
            afterwards, which cards issued in India refuse.
          </span>
        </label>
```

The filter is a convenience, not the guard: `saveOffer` refuses the same cases
in Task 8, because a form posts whatever it posts and a tab left open through a
change should not be able to write a slot that cannot be charged.

- [ ] **Step 2: Write the end-to-end test**

```ts
import { describe, it, expect, afterAll } from "vitest";
import { startOfferCheckout, completeOfferCheckout } from "@/lib/offer-checkout";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

const canRun =
  !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "00000000-0000-0000-0000-0000000000a1";
const made: string[] = [];
const users: string[] = [];

describe.skipIf(!canRun)("buying an offer with its bump (integration)", () => {
  it("takes one payment, grants both, and books two lines", async () => {
    const db = createServiceClient();
    const storeId = await getStoreId();

    const mk = async (cents: number, extra: Record<string, unknown> = {}) => {
      const id = crypto.randomUUID();
      made.push(id);
      const { error } = await db.from("offers").insert({
        id, store_id: storeId, key: `zz-e2e-${id}`, name: "zz e2e fixture",
        grant_type: "subscription", grant_app_id: APP,
        grant_entitlement_key: "content-engine", grant_channels: [],
        billing_type: "one_time", price_cents: cents, currency: "usd",
        headline: "fixture", description: "fixture", ...extra,
      });
      if (error) throw new Error(`fixture: ${error.message}`);
      return id;
    };

    const bumpId = await mk(2900);
    const hostId = await mk(4700, { bump_offer_id: bumpId });

    const email = `e2e_${Date.now()}@example.test`;
    const created = await db.auth.admin.createUser({ email, email_confirm: true });
    const userId = created.data.user!.id;
    users.push(userId);
    await db.from("users").insert({ id: userId, store_id: storeId, email });

    const start = await startOfferCheckout({ userId, email, offerId: hostId, bumpChoice: 0 });
    expect(start.ok).toBe(true);
    if (!start.ok) return;

    const piId = start.clientSecret.split("_secret_")[0];
    await stripe().paymentIntents.confirm(piId, {
      payment_method: "pm_card_visa",
      return_url: "http://localhost:3000/checkout/offer/complete",
    });
    expect(await completeOfferCheckout(piId)).toEqual({ ok: true });

    // One charge for both.
    const pi = await stripe().paymentIntents.retrieve(piId);
    expect(pi.amount).toBe(7600);

    // And no second charge was created to cover the bump.
    const all = await stripe().paymentIntents.list({ customer: pi.customer as string, limit: 10 });
    expect(all.data.filter((p) => p.status === "succeeded")).toHaveLength(1);

    const { data: orders } = await db.from("orders").select("id").eq("user_id", userId);
    expect(orders).toHaveLength(1);
    const { data: items } = await db.from("order_items").select("kind, offer_id, amount_cents").eq("order_id", orders![0].id);
    expect(items).toHaveLength(2);
    expect(items!.some((i) => i.kind === "bump" && i.offer_id === bumpId)).toBe(true);

    const { data: own } = await db.from("ownership").select("offer_id").eq("user_id", userId);
    expect(own).toHaveLength(2);

    // A refresh must not grant or bill again.
    expect(await completeOfferCheckout(piId)).toEqual({ ok: true });
    const { data: again } = await db.from("order_items").select("id").eq("order_id", orders![0].id);
    expect(again).toHaveLength(2);
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const id of users) {
    await db.from("ownership").delete().eq("user_id", id);
    const { data: orders } = await db.from("orders").select("id").eq("user_id", id);
    for (const o of orders ?? []) await db.from("order_items").delete().eq("order_id", o.id);
    await db.from("orders").delete().eq("user_id", id);
    await db.from("users").delete().eq("id", id);
    await db.auth.admin.deleteUser(id);
  }
  for (const id of made) await db.from("offers").update({ bump_offer_id: null }).eq("id", id);
  for (const id of made) await db.from("offers").delete().eq("id", id);
});
```

- [ ] **Step 3: Run it**

Run: `npx vitest run lib/offer-bump-e2e.integration.test.ts`
Expected: PASS

- [ ] **Step 4: Full suite, then commit**

```bash
npx vitest run
git add components/admin/offer-form.tsx lib/offer-bump-e2e.integration.test.ts
git commit -m "Set an offer's bump, and pin the whole path end to end"
```

---

## Before it ships

- [ ] `npx vitest run` — whole suite green
- [ ] `npx tsc --noEmit` — clean
- [ ] `npx eslint` — no new warnings
- [ ] **Run the migration against production BEFORE pushing.** Migrations do not run on deploy. Deployed first, `OFFER_COLUMNS` selects `bump_offer_id` from a table that has not got it, and every offer checkout, the library and the storefront go down together.
- [ ] Announce the deploy (60s), wait the full window, then push. `GI_CRON_SECRET` is in `~/Documents/Projects/KVM8-CREDENTIALS.md`.
- [ ] Watch the Coolify deployment to `finished` and confirm it names the pushed commit.

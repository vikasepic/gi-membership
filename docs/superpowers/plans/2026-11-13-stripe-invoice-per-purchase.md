# Stripe Invoice Per Purchase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every purchase on `/account` offers Stripe's Receipt and Stripe's Invoice; a one-off purchase's invoice is made in Stripe on first click, and Grow stores nothing.

**Architecture:** A new `lib/order-invoice.ts` turns one paid order into one finalized Stripe invoice paid by the order's existing PaymentIntent (`invoices.attachPayment`), and remembers it on the PaymentIntent's metadata (`grow_invoice_id`). `lib/receipts.ts` reports, per order, a receipt URL, an existing invoice URL, or "can make one". A GET route `/account/invoice/[orderId]` makes or finds the invoice for the signed-in member and redirects to Stripe.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` for route handlers before Task 4), Stripe Node SDK 22 (API `2026-06-24.dahlia`), Supabase, vitest.

**Spec:** `docs/superpowers/specs/2026-11-13-stripe-invoice-per-purchase-design.md`

## Global Constraints

- No migration, no new table or column. The invoice id lives only on the PaymentIntent: `metadata.grow_invoice_id`.
- Every invoice Grow makes carries `metadata.store_created = "true"` and `metadata.orderId = <order id>`.
- Never charge: the invoice is paid only by attaching the order's own succeeded PaymentIntent. If Stripe refuses the attach, fall back to `invoices.pay(id, { paid_out_of_band: true })`. Never `auto_advance: true`, never `sendInvoice`.
- Invoice total equals the PaymentIntent's `amount_received` to the cent, always.
- Dated the purchase day: `effective_at` = the order's `created_at` in seconds.
- Do not touch account-wide Stripe settings (portal configuration, invoice settings, branding). Five other apps share the account.
- Live Stripe is production. Tests run only with `STRIPE_SECRET_KEY` starting `sk_test_` (`describe.skipIf(!canRun)`), fixtures prefixed `zz-` with a timestamp, cleaned up in `afterAll`.
- Hint copy (exact): "Need your company name or address on an invoice? Update it under Manage billing first. An invoice can't be changed once it's made."
- No em dashes in any user-facing copy.

## Review Focus

1. **Admin in View as clicks Invoice on an order with no invoice yet:** nothing is created (it costs a fee and freezes the member's details); they land back on `/account?invoice=view-as` with a line saying so. Test in Task 4.
2. **Member opens another member's order id in the URL:** 404-style refusal, no Stripe call. Test in Task 2 (`invoiceForOrder` scoped by `userId`).
3. **Test-mode order seen by the live key (or the reverse):** no Invoice link, no Stripe call. `orders.livemode` must match `stripeMode()`. Test in Task 3.
4. **Invoice was voided by hand in Stripe:** the metadata points at a void invoice; treat it as none and make a new one, then overwrite the metadata. Test in Task 2.
5. **Stripe customer already has a name** (a company name the buyer typed in Manage billing): never overwritten by Grow's name. Test in Task 2.

---

### Task 1: The five scenarios as failing tests

Written before any feature code (owner, 13 Nov). Each builds a real test-mode purchase through the real checkout (pattern: `lib/offer-bump-e2e.integration.test.ts`: `startOfferCheckout`, `paymentIntents.confirm(pi, { payment_method: "pm_card_visa" })`, `completeOfferCheckout`).

**Files:**
- Create: `lib/order-invoice.integration.test.ts`

**Interfaces:**
- Consumes (from Task 2, not yet written, so the file fails to import): `invoiceForOrder(args: { orderId: string; userId: string; create: boolean }): Promise<InvoiceResult>`
- Consumes (from Task 3): `purchaseDocsForUser(userId)` rows with `receiptUrl: string | null`, `invoiceUrl: string | null`, `canMakeInvoice: boolean`; `subscriptionInvoicesForUser(userId)`.

- [ ] **Step 1: Write the five scenario tests**

```ts
describe.skipIf(!canRun)("1. one offer, one payment", () => {
  it("makes one paid invoice dated the purchase day, one line at the charge", async () => {
    // one-time offer 29700, bought; then
    const r = await invoiceForOrder({ orderId, userId, create: true });
    expect(r.ok).toBe(true);
    const inv = await stripe().invoices.retrieve(r.invoiceId, { expand: ["lines"] });
    expect(inv.status).toBe("paid");
    expect(inv.amount_paid).toBe(29700);
    expect(inv.lines.data.map((l) => l.amount)).toEqual([29700]);
    expect(inv.effective_at).toBe(Math.floor(Date.parse(order.created_at) / 1000));
    expect(inv.metadata).toMatchObject({ store_created: "true", orderId });
    expect(inv.customer_name).toBe(buyerName);
    expect((await stripe().paymentIntents.retrieve(piId)).metadata.grow_invoice_id).toBe(inv.id);
  });
  it("a second call and two concurrent calls return the same invoice", async () => {
    const [a, b] = await Promise.all([invoiceForOrder(args), invoiceForOrder(args)]);
    const c = await invoiceForOrder(args);
    expect(new Set([a.invoiceId, b.invoiceId, c.invoiceId]).size).toBe(1);
    const all = await stripe().invoices.list({ customer, limit: 10 });
    expect(all.data.filter((i) => i.metadata?.orderId === orderId)).toHaveLength(1);
  });
  it("adds no order, and recordRenewal ignores the new invoice", async () => {
    // count orders for the user before/after: unchanged
    expect(await recordRenewal(inv)).toMatchObject({ recorded: false });
    expect((await subscriptionInvoicesForUser(userId)).map((i) => i.id)).not.toContain(inv.id);
  });
});
describe.skipIf(!canRun)("2. product, bump and coupon in one payment", () => {
  it("one line per item, the coupon in the memo, total equals the charge", async () => {
    // host 4700 + bump 2900, coupon zz-<ts> 10% -> charge from the PI
    expect(inv.lines.data).toHaveLength(2);
    expect(inv.total).toBe(pi.amount_received);
    expect(inv.description).toContain(couponCode);
  });
});
describe.skipIf(!canRun)("3. one-off and a subscription in one checkout", () => {
  it("invoices the one-off payment only", async () => {
    // offer with a one-time bump and a trial subscription line
    expect(inv.total).toBe(pi.amount_received);
    expect(inv.lines.data.some((l) => l.description?.includes(subscriptionLineDescription))).toBe(false);
  });
});
describe.skipIf(!canRun)("4. subscriptions", () => {
  it("creates nothing for a paid first charge or a $0 trial; shows Stripe's own invoice", async () => {
    const before = (await stripe().invoices.list({ customer, limit: 20 })).data.length;
    const docs = await purchaseDocsForUser(userId);
    expect(docs.find((d) => d.orderId === paidSubOrder)).toMatchObject({ invoiceUrl: expect.stringContaining("stripe.com"), receiptUrl: expect.any(String), canMakeInvoice: false });
    expect(docs.find((d) => d.orderId === trialOrder)).toMatchObject({ invoiceUrl: null, receiptUrl: null, canMakeInvoice: false });
    expect((await invoiceForOrder({ orderId: paidSubOrder, userId, create: true })).ok).toBe(false);
    expect((await stripe().invoices.list({ customer, limit: 20 })).data.length).toBe(before);
  });
});
describe.skipIf(!canRun)("5. refunds", () => {
  it("a fully refunded one-off still gets its invoice; the refund path is unchanged", async () => {
    await stripe().refunds.create({ payment_intent: piId });
    const r = await invoiceForOrder({ orderId, userId, create: true });
    expect(r.ok).toBe(true);
    expect((await stripe().invoices.retrieve(r.invoiceId)).amount_paid).toBe(pi.amount_received);
  });
  it("a refund after the invoice leaves the invoice as made and the order found by its PaymentIntent", async () => {
    // make invoice, then partial refund 1000
    expect((await orderForPaymentIntent(piId))?.id).toBe(orderId);
    expect((await stripe().invoices.retrieve(invoiceId)).status).toBe("paid");
  });
});
```

Scenario 4's "paid first charge" order: a subscription offer with no trial bought through `startOfferCheckout` + `completeOfferCheckout` with a `seti_`. Use whatever that path produces; assert on what it produces, do not insert rows by hand.

- [ ] **Step 2: Run, confirm it fails on the missing module**

Run: `npx vitest run lib/order-invoice.integration.test.ts`
Expected: FAIL, cannot resolve `@/lib/order-invoice`.

- [ ] **Step 3: Commit**

```bash
git add lib/order-invoice.integration.test.ts
git commit -m "Five invoice scenarios, failing until the invoice exists"
```

### Task 2: Make or find the invoice for one order

**Files:**
- Create: `lib/order-invoice.ts`, `lib/order-invoice.test.ts`

**Interfaces:**
- Produces:
  - `export function invoiceLines(input: { items: { description: string; amountCents: number; subscription: boolean }[]; taxCents: number; chargedCents: number; fallbackDescription: string }): { description: string; amountCents: number }[]`: drops subscription lines and $0 lines, adds `"Tax"` when `taxCents > 0`; if the sum is not `chargedCents`, returns `[{ description: fallbackDescription, amountCents: chargedCents }]`.
  - `export function couponMemo(code: string | null, discountCents: number, currency: string): string | null`: `"Coupon CODE applied: -$X.XX"` (plain hyphen), null when no discount.
  - `export type InvoiceResult = { ok: true; invoiceId: string; hostedUrl: string | null; pdfUrl: string | null } | { ok: false; reason: "not_found" | "not_eligible" | "view_only" | "stripe_error" }`
  - `export async function invoiceForOrder(args: { orderId: string; userId: string; create: boolean }): Promise<InvoiceResult>`

- [ ] **Step 1: Unit tests for the pure parts and the guards** (`lib/order-invoice.test.ts`, Stripe and DB mocked as in `lib/affiliate-tracker.test.ts`)

```ts
expect(invoiceLines({ items: [{ description: "Host", amountCents: 4700, subscription: false }, { description: "Bump", amountCents: 2900, subscription: false }], taxCents: 0, chargedCents: 7600, fallbackDescription: "Host + Bump" })).toEqual([{ description: "Host", amountCents: 4700 }, { description: "Bump", amountCents: 2900 }]);
expect(invoiceLines({ items: [{ description: "Plan", amountCents: 0, subscription: true }, { description: "Bump", amountCents: 1900, subscription: false }], taxCents: 0, chargedCents: 1900, fallbackDescription: "x" })).toEqual([{ description: "Bump", amountCents: 1900 }]);
expect(invoiceLines({ items: [{ description: "A", amountCents: 4000, subscription: false }], taxCents: 0, chargedCents: 3800, fallbackDescription: "A" })).toEqual([{ description: "A", amountCents: 3800 }]);
expect(invoiceLines({ items: [{ description: "A", amountCents: 1000, subscription: false }], taxCents: 200, chargedCents: 1200, fallbackDescription: "A" })).toEqual([{ description: "A", amountCents: 1000 }, { description: "Tax", amountCents: 200 }]);
expect(couponMemo("ZZ10", 470, "usd")).toBe("Coupon ZZ10 applied: -$4.70");
expect(couponMemo(null, 0, "usd")).toBeNull();
// guards, each asserting no Stripe create call:
// another user's order -> { ok:false, reason:"not_found" }
// order.livemode !== (stripeMode()==="live") -> not_eligible
// no stripe_payment_intent_id, or stripe_invoice_id set, or amount_received 0, or no customer -> not_eligible
// app-billed order (isAppBilledOrder) -> not_eligible
// create:false with no invoice yet -> { ok:false, reason:"view_only" }
// metadata.grow_invoice_id points at a void invoice -> a new invoice is made and the metadata overwritten
// customer.name "WINR GmbH" -> customers.update never called; customer.name null -> set to users.username
```

- [ ] **Step 2: Run, confirm failures**

Run: `npx vitest run lib/order-invoice.test.ts`
Expected: FAIL, functions not defined.

- [ ] **Step 3: Implement `lib/order-invoice.ts`**

Order of work in `invoiceForOrder`, each step checking state so a repeat converges on the same invoice:
1. Load the order by `id` and `user_id` (statuses `paid`, `refunded`) with its items; apply the guards above.
2. Retrieve the PaymentIntent. If `metadata.grow_invoice_id` names an invoice that is not `void`, return it.
3. If `create` is false, return `view_only`.
4. If the customer has no name, set it from `users.username`.
5. `invoices.create` with `idempotencyKey: grow-invoice-<orderId>`: customer, `collection_method: "charge_automatically"`, `auto_advance: false`, `pending_invoice_items_behavior: "exclude"`, `effective_at`, `currency`, `description` = `couponMemo(...)`, metadata per Global Constraints.
6. If the invoice is a draft with no lines, add `invoiceLines(...)` (each `invoiceItems.create` with `invoice: id` and idempotency key `grow-invoice-<orderId>-line-<n>`), then `finalizeInvoice`.
7. If `open`: `attachPayment(id, { payment_intent })`; on refusal, `pay(id, { paid_out_of_band: true })` and log the refusal reason once.
8. `paymentIntents.update(pi, { metadata: { grow_invoice_id: id } })`, then return the hosted and PDF URLs.
Any Stripe throw: `recordError({ source: "order_invoice", ... })` with no retry job, return `stripe_error`.

- [ ] **Step 4: Run unit tests, then the scenario file**

Run: `npx vitest run lib/order-invoice.test.ts lib/order-invoice.integration.test.ts`
Expected: unit tests PASS; scenarios 1, 2, 3 and 5 PASS (4 needs Task 3).

- [ ] **Step 5: Commit**

```bash
git add lib/order-invoice.ts lib/order-invoice.test.ts
git commit -m "A paid one-off order can get its Stripe invoice, made once"
```

### Task 3: Receipt and invoice per purchase

**Files:**
- Modify: `lib/receipts.ts` (`PurchaseDoc`, `purchaseDocsForUser`, `subscriptionInvoicesForUser`)
- Test: `lib/receipts.test.ts`

**Interfaces:**
- Produces: `PurchaseDoc` replaces `documentUrl`, `pdfUrl`, `kind` with `receiptUrl: string | null`, `invoiceUrl: string | null`, `canMakeInvoice: boolean`. Everything else on it unchanged.

- [ ] **Step 1: Tests in `lib/receipts.test.ts`** (Stripe mocked)

```ts
// one-off, PI without grow_invoice_id -> { receiptUrl: charge.receipt_url, invoiceUrl: null, canMakeInvoice: true }
// one-off, PI with grow_invoice_id -> invoiceUrl = that invoice's hosted_invoice_url, canMakeInvoice false
// renewal (stripe_invoice_id) -> invoiceUrl = hosted_invoice_url, receiptUrl = the paying charge's receipt_url
// subscription first payment (no PI, no invoice id, total > 0) -> the subscription's invoice with billing_reason "subscription_create" and amount_paid > 0
// total 0 -> both null, canMakeInvoice false
// order.livemode not matching stripeMode() -> both null, no Stripe call
// subscriptionInvoicesForUser drops an invoice with no subscription (subscriptionIdOf null)
```

- [ ] **Step 2: Run, confirm failures**

Run: `npx vitest run lib/receipts.test.ts`
Expected: FAIL on the new fields.

- [ ] **Step 3: Implement**

For a renewal or first-payment invoice, read the paying charge from the invoice's payments (`expand: ["payments.data.payment.payment_intent.latest_charge"]`, the shape `lib/renewals.ts` `orderForInvoicePayment` already reads; reuse its helper if it exports one). A failed Stripe read leaves the row with nulls, as today.

- [ ] **Step 4: Run tests, including the scenario file**

Run: `npx vitest run lib/receipts.test.ts lib/order-invoice.integration.test.ts`
Expected: all PASS, including scenario 4.

- [ ] **Step 5: Commit**

```bash
git add lib/receipts.ts lib/receipts.test.ts
git commit -m "Every purchase reports its receipt and its invoice"
```

### Task 4: The account page and the invoice link

**Files:**
- Create: `app/(store)/account/invoice/[orderId]/route.ts`, `app/(store)/account/invoice/[orderId]/route.test.ts`
- Modify: `app/(store)/account/page.tsx` (purchases list, around lines 100-155)

**Interfaces:**
- Consumes: `invoiceForOrder` (Task 2), `viewer()` from `lib/view-as.ts`, `PurchaseDoc` (Task 3).

- [ ] **Step 1: Route tests** (`viewer` and `invoiceForOrder` mocked)

```ts
// no viewer -> 307, Location "/login?next=/account"
// viewer.viewingAs -> invoiceForOrder called with create:false; when view_only -> Location "/account?invoice=view-as"
// ok -> 303 to hostedUrl (absolute stripe.com URL)
// not_found / not_eligible / stripe_error -> Location "/account?invoice=unavailable"
// every local redirect is a relative Location (AGENTS.md: never new URL(path, req.url))
```

- [ ] **Step 2: Run, confirm failures**

Run: `npx vitest run "app/(store)/account/invoice"`
Expected: FAIL, route missing.

- [ ] **Step 3: Implement the route and the page**

Page, per purchase row: "Receipt →" when `receiptUrl`; "Invoice →" to `invoiceUrl` when set, else to `/account/invoice/<orderId>` when `canMakeInvoice` (a plain `<a target="_blank">`, never a prefetching `Link`). Above the list, when any row has `canMakeInvoice` and the member has a billing account, the hint line from Global Constraints. `?invoice=view-as` shows "Viewing as a member: an invoice is made only when they open it themselves."; `?invoice=unavailable` shows "That invoice isn't available right now. Try again in a moment." Whitelist both values; anything else shows nothing.

- [ ] **Step 4: Run the tests, then look at it**

Run: `npx vitest run "app/(store)/account"`
Expected: PASS. Then on the local dev server, a test-mode buyer's `/account`: both links per row, Invoice opens Stripe's page with "Greater Inside" and "Paid". Screenshot for the owner.

- [ ] **Step 5: Commit**

```bash
git add "app/(store)/account"
git commit -m "Account page: receipt and invoice for every purchase"
```

### Task 5: Ship

- [ ] **Step 1: Full suite, gated on its own exit status, then CI-style with `.env.local` moved to the scratchpad**

Run: `npx vitest run --exclude 'tmp-*/**'; echo "exit $?"`
Expected: `exit 0` both ways.

- [ ] **Step 2: Note it in `docs/lessons.md` only if a review cost a round.** Add the feature to the "Where the depth is" table only if a new doc was written (none planned).

- [ ] **Step 3: With the owner's go-ahead, push.** Send the 60-second deploy notice, wait 60 seconds, push within two minutes or re-send. Then `gh run list --branch main --limit 1` until green.

- [ ] **Step 4: Live check, owner's go-ahead first** (costs Stripe's fee on one invoice). On a team-owned live order: Invoice opens a Stripe invoice reading Greater Inside, 103 Ajuga Court, the team member's name, "Paid", the purchase date; a second click opens the same one; no new order row; nothing on `/admin/errors`; the owner confirms no email arrived.

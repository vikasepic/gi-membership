# Going live with Stripe

The store has run in Stripe **test mode** since day one. This is the checklist to
move it to real money, in the order that avoids taking a payment you can't
deliver or refund.

**Nothing here happens automatically.** Swapping the keys is the last step, not
the first — everything above it is cheaper to fix before a real customer hits it.

---

## 0. Before anything: what still blocks activation

Stripe reviews these when it activates a live account, and two are currently
unfinished:

| Blocker | State | Where |
|---|---|---|
| Terms of Service page | **Draft** — renders a visible "not finished" warning | `lib/legal.ts` → `address`, `governingLaw` |
| Refund policy page | Same warning, same cause | as above |
| Legal entity name | `Infinite Creative` — **inferred from the Stripe card form, unconfirmed** | `lib/legal.ts` → `legalEntity` |
| Privacy policy | Complete and accurate | — |

Fill those three fields first. While any is blank, every policy page tells
visitors the policy is a draft — which is the honest behaviour, and also not
something to show a Stripe reviewer.

## 1. What the code already handles

Verified, so you don't have to re-check:

- **Mode is derived, never hardcoded.** `stripeMode()` reads the key prefix. No
  branch anywhere assumes test.
- **Stripe products are per-mode.** Offers carry `stripe_product_id_test` and
  `stripe_product_id_live` separately, and `ensureStripeProduct` writes whichever
  matches the current key. Switching to live creates fresh live products on first
  use — it will not reuse or corrupt the test ones.
- **Integration tests cannot touch live money.** Every Stripe test is gated on
  `STRIPE_SECRET_KEY` starting with `sk_test_`. With live keys present they skip
  rather than charge a card.
- **Key-mode mismatch fails at boot** (added alongside this document). A live
  secret with a test publishable — the classic go-live slip — throws immediately
  instead of failing mid-checkout with an error that looks like a declined card.
- **Admin shows the mode.** The header reads *Stripe test mode* or *Live
  payments*, so you always know which set of orders you are looking at.

## 2. Switch the keys

In **Coolify → gi-membership → Environment**, replace:

| Variable | From | To |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` | `sk_live_…` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_…` | `pk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | test endpoint's `whsec_…` | **live endpoint's** `whsec_…` (see step 3) |

Change all three together. Two of the three is the state the new guard exists to
catch, and it will refuse to boot rather than half-work.

> Enter these yourself in the Coolify UI. They are live financial credentials and
> should not pass through a chat transcript or a file in this repo.

## 3. Create the LIVE webhook endpoint

Test and live webhooks are separate objects with separate signing secrets. The
test secret is meaningless in live mode.

1. Stripe Dashboard → toggle to **live** → Developers → Webhooks → Add endpoint
2. URL: `https://grow.greaterinside.com/api/webhooks/stripe`
3. Events — these are the ones the handler actually acts on:
   - `payment_intent.succeeded`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
   - `invoice.payment_action_required`
   - `charge.refunded`
4. Copy the new `whsec_…` into `STRIPE_WEBHOOK_SECRET`.

**If you skip this:** the thank-you page still calls the same idempotent
`finalizeOrder`, so a purchase completes. But trial→active conversion, dunning,
cancellation and refunds all arrive only by webhook — those would silently stop.

## 4. Tax

`STRIPE_TAX_ENABLED` is not set in production, so tax calculation is off and
`tax_cents` is 0. With EU/UK traffic you need it on, and Stripe needs to know
where you are registered.

- Register for VAT/OSS where required, then add those registrations in Stripe Tax
- Set `STRIPE_TAX_ENABLED=true`
- The checkout already asks for a billing country and refuses to proceed without
  one when tax is enabled, so the wiring is done

Leave it off until the registrations exist; charging a tax you can't remit is
worse than not charging it.

## 5. The live test itself

Use a **real card, your own, on the cheapest product.** Test cards do not work in
live mode.

Run the whole path, and check each one:

| Step | What to confirm |
|---|---|
| Buy the cheapest product | Charge appears in the **live** Stripe dashboard |
| Receipt | Email arrives from `no-reply@greaterinside.com` |
| Library | The course appears and the file downloads |
| Admin → Orders | Order listed, with its line items |
| Take the bump too (second purchase) | **Two** Stripe objects — a PaymentIntent AND a separate subscription. Never one merged charge. |
| Connected app | Content Engine provisioned for that email |
| Refund from Admin → Orders | Money returns, access is removed, order shows `refunded` |
| Subscription cancel | Access ends, ownership goes `canceled` |

Refund yourself afterwards. The refund path is idempotent and was verified
against a real Stripe charge in test mode, but this is the first time it runs on
live money.

## 6. Immediately after

- **Rotate the GitHub PAT.** It was pasted into a chat and is treated as
  compromised. It deploys production.
- **Watch the first real orders manually.** There is still no error monitoring —
  nothing writes `error_events` — so a failed webhook or a failed connected-app
  provision is currently invisible. Until that exists, check Admin → Orders
  against the Stripe dashboard for the first few days.
- Consider a staging environment before the next schema change; migrations
  currently go straight to production.

## Rollback

Set the three variables back to their test values and redeploy. Nothing in the
database is mode-specific except the `stripe_product_id_live` columns, which are
simply ignored in test mode — so switching back is safe and loses nothing.

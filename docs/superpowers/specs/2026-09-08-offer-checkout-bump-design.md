# An order bump on an offer's checkout — design

**8 September 2026.** Two parts, built in order, shipped together.

## Why this is two things

The ask was one sentence: *let an offer carry a bump the way a product does.*
Reading the money path first turned up a live defect underneath it, and
building the feature on top would have written a second copy of a bug the
product checkout already has twenty lines of comment explaining.

### What is wrong today

`startOfferCheckout` creates **only** a SetupIntent — it is the sole intent in
the file. `completeOfferCheckout` then calls `fulfilOffer`, whose one-time
branch charges:

```ts
off_session: true,
confirm: true,
```

That is the pattern the product checkout deliberately removed, in its own
words:

> Stripe refuses an off-session card payment on a card issued in India without
> an RBI e-mandate. So the product was charged, the add-on was not.

The product path fixed it by folding everything into one **on-session**
PaymentIntent. The offer path never got the fix, because until this week every
offer was recurring — a trial charges nothing today, so saving a card and
letting the subscription bill was correct. One-time offers are new
(`book-writer`, `the-viral-hook-generator`, `150-product-ideas`,
`book-launch-system`), and they take that untouched off-session branch.

**Book Writer is live at $47 and cannot charge a majority of this store's
buyers.** Three of the last five orders carry `buyer_country = IN`.

**Nothing would have caught it.** Every test that exercises
`startOfferCheckout` builds a *recurring* fixture. The one-time path through
that checkout has no coverage at all.

So: Part 1 makes the offer checkout charge on-session. Part 2 adds the bump,
which needs Part 1 because "the bump rides the order's own intent" requires the
order to have an on-session intent to ride.

---

## Part 1 — a one-time offer charges on-session

### The rule

| Offer | Intent | Why |
|---|---|---|
| `one_time` | **PaymentIntent**, `setup_future_usage: "off_session"` | The buyer is present, so no mandate is needed. The card is still saved, which the one-tap standing offer depends on. |
| `recurring` | SetupIntent, unchanged | A trial takes nothing today and a $0 PaymentIntent is not a thing. The subscription bills on its own terms. |

The branch is on `billingType`, not on "is there money today". A recurring
offer with no trial does charge today, but Stripe charges it through
subscription creation, which is a different mechanism with its own mandate
handling. Widening the branch to cover it would change how subscriptions are
billed, which is not what this is for.

### Files

**`lib/offer-checkout.ts`**

- `StartResult` gains `mode: "payment" | "setup"`, matching what
  `createCheckoutIntent` already returns for products.
- `startOfferCheckout` creates a PaymentIntent for a one-time offer, carrying
  the identical metadata it writes on the SetupIntent today — `storeId`,
  `userId`, `offerId`, `offerPriceId`, `couponCode`, `newAccount` — plus
  `store_created: "true"` and a readable `description`, for the same reason the
  product charge carries them: this Stripe account is shared with five other
  apps, and a charge with blank description and uuid-only metadata cannot be
  told from theirs in the dashboard, in exports, or in Zapier.
- The amount is `immediateChargeCents(sold)` less any coupon discount, floored
  at `MIN_CHARGE_CENTS` — the same arithmetic `completeOfferCheckout` performs
  today, moved earlier because the money is now taken at confirm time rather
  than after.
- `completeOfferCheckout(intentId, country?)` accepts either kind. It retrieves
  a PaymentIntent when the id starts `pi_`, a SetupIntent when `seti_`, and
  refuses anything else rather than guessing.
- The order row records `stripe_payment_intent_id` for the payment case (the
  column exists and the product path already uses it), `stripe_setup_intent_id`
  otherwise.

**`lib/checkout.ts`** — `fulfilOffer` gains `prepaid?: boolean`. When true, the
one-time branch grants without creating a PaymentIntent, because the money is
already in the order's own intent. This mirrors `fulfilBump`'s existing
`prepaid`, and it is the whole mechanism by which an on-session charge and
fulfilment stay one payment.

**`components/checkout/offer-checkout-form.tsx`** — `stripe.confirmPayment`
when `mode === "payment"`, `confirmSetup` otherwise. Same `return_url`.

**`app/(store)/checkout/offer/complete/route.ts`** — reads `payment_intent` and
`payment_intent_client_secret` as well as the setup pair, and passes whichever
arrived to `completeOfferCheckout`.

**`lib/post-purchase.ts`** — `mintOfferLogin` verifies a PaymentIntent as well
as a SetupIntent. Without this a first-time buyer of a one-time offer is not
signed in on the way back, lands on `/library`, and is bounced to `/login` to
find an email for the thing they just paid for.

### One behaviour genuinely changes

Today the coupon is resolved **twice**: once at start so a dead code fails while
the field is still on screen, and again at fulfilment, where the comment is
explicit that a code which has since expired is *dropped rather than refused* —
"the card is already saved and the buyer is committed; failing the whole
purchase over a discount is the worse of the two outcomes".

With the money taken at confirm time that second resolution no longer decides
an amount, because the amount was authorised before it ran. The coupon is final
when the PaymentIntent is created.

This is the honest trade and it should be stated rather than discovered: a code
that dies in the seconds between opening the form and paying now charges the
**discounted** amount that was quoted and displayed, instead of quietly
charging full price. That is the better of the two, and it is what the buyer
agreed to — but it does mean a redemption limit can be exceeded by one in a
race. `resolveCoupon` already enforces limits at start; the window is the life
of one checkout, and the alternative is charging somebody a number they never
saw.

The order still records `coupon_code` and `discount_cents` from the resolution
that set the amount, so the ledger and the card continue to agree.

### What must stay true

- **A refresh of the return page grants once.** The eligibility re-check and
  the intent-derived idempotency key both survive; the key becomes
  `offerco_${intentId}_${offer.id}`, the same shape with a wider input.
- **A failed charge leaves no paid order.** Today the order is written before
  `fulfilOffer` and voided on throw. With a PaymentIntent the money is taken
  before `completeOfferCheckout` runs at all, so the order is written from an
  intent that has already succeeded. The guard is the **intent's own status**,
  checked inside `completeOfferCheckout` exactly as it checks the SetupIntent's
  today — not `redirect_status`, which the route only tests when Stripe sends
  one and which a hand-typed URL can omit.
- **`livemode` keeps being recorded.** Two test-mode rows already counted as
  revenue once.

---

## Part 2 — the bump

### Schema

`supabase/migrations/0070_offer_bump.sql`:

(0069 is the highest today. If the `prominence` work lands first it takes
0070 and this becomes 0071 — the number is whichever is next when it is
written, not a number reserved now.)

```sql
alter table offers
  add column if not exists bump_offer_id uuid references offers(id) on delete set null,
  add column if not exists bump_price_ids uuid[] not null default '{}';

alter table offers
  add constraint offers_bump_not_self
  check (bump_offer_id is null or bump_offer_id <> id);
```

Named, because an unnamed CHECK is invisible in a diff and this repo has twice
shipped a feature the database then refused.

`bump_price_ids` mirrors `products.bump_price_ids`: which of the bump offer's
prices *this* placement shows. The same offer may be sold at three prices in
one place and one price in another.

**No `bump_product_id`.** Products have one; an offer does not need it, because
an offer that grants a product is exactly what the user is building. Adding a
second nullable target would mean a second guard and a second branch in the
charge path for a case nobody has.

### Resolution

`startOfferCheckout` resolves the bump with the same rules as
`createCheckoutIntent`, and by calling the same helpers rather than
reimplementing them:

- `shouldShowOffer(offer, owned)` is the gate — the same one the page uses to
  decide whether to render it, so display and fulfilment cannot disagree.
- The browser sends an **index** into the list the server rebuilt, never an id,
  so the only thing a tampered request can buy is something it was shown. Out
  of range **refuses**; it does not fall back to the headline price.
- `offerAsSoldTo` resolves the trial before anything is charged, and a bump
  whose trial was shown but has already been used **refuses** with the existing
  `bump_trial_used` message rather than silently charging full price.
- Already owned **refuses** rather than dropping the bump silently. Quietly
  discarding it charges for the base and ignores what they ticked, with nothing
  on the receipt.

### Charging

A one-time bump is added to the base PaymentIntent's amount, and the intent
carries `bumpOfferId` and `bumpPrepaid: "true"`. `completeOfferCheckout` then
calls the existing `fulfilBump` with `prepaid: true` and
`paidByIntentId: pi.id`, which grants, writes one `order_items` line, and
charges nothing.

**The bump on an offer checkout must be one-time.** A recurring bump would mean
creating a subscription from a saved card after the fact — off-session, and
therefore the same India refusal this design exists to remove. `saveOffer`
rejects a recurring offer in the bump slot with a message saying so, rather
than letting it be configured and fail at the till.

### Admin and rendering

- The offer form gains a **Bump** section mirroring the product form's: pick an
  offer, pick which of its prices to show. It lists only one-time offers, and
  never the offer being edited.
- `components/checkout/order-bump.tsx` already exists as a standalone
  component with a `BumpSummary` type. The offer checkout renders it. No new UI
  component.

---

## Deliberately not in this

- **Tax on the offer checkout.** It has never calculated any, and Stripe Tax is
  switched off for this store pending VAT registrations. Adding it here would
  change what every existing offer charges, which is a separate decision.
- **`bump_alt_offer_id`.** The product's second-offer pairing is on its way out
  in favour of `bump_price_ids`; a new surface should not adopt it.
- **Upsells on offer checkouts.** A different flow with its own page and token.

## Testing

Integration, against local Supabase and Stripe test mode:

- A one-time offer bought through the offer checkout produces a **PaymentIntent**,
  not a SetupIntent, and the order records it. *This assertion fails today.*
- A recurring offer still produces a SetupIntent and a subscription.
- A one-time offer with a bump produces **one** PaymentIntent for the combined
  amount, two `order_items` lines, and two ownership rows.
- `fulfilOffer({ prepaid: true })` grants and creates no PaymentIntent.
- A refresh of the return page grants once — the existing idempotency test,
  extended to the payment path.
- A bump the buyer already owns refuses before any charge.
- A bump index out of range refuses.
- The self-reference CHECK actually rejects, and `saveOffer` rejects a
  recurring bump. Written because a constraint that silently is not there looks
  exactly like one that is.

Unit:

- `mintOfferLogin` accepts a PaymentIntent, rejects a mismatched client secret,
  rejects an unsucceeded intent.

## Migration and deploy order

Migrations do **not** run on deploy — there is no step in the `Dockerfile`. The
Part 2 migration runs against production **before** the code ships. Deployed
first, `startOfferCheckout` would select a column that does not exist and take
every offer checkout down.

Both parts ship in one deploy, Part 1 merged and green before Part 2 begins.

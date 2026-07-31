# CRM webhook — store → Zapier → ActiveCampaign

The store posts one JSON event per thing that actually happened to a single
Zapier Catch Hook. Everything below was captured from real events, not written
from intent.

## Why not tag off Stripe

Stripe sees money, not the catalogue. Tagging off it means:

- **Trials are invisible.** A 7-day trial is a $0 subscription with no charge.
- **One purchase is up to three Stripe objects** — base PaymentIntent, bump
  charge, subscription — so one buyer fires three events to deduplicate.
- **$0 orders have no PaymentIntent at all**, so they never fire.
- **Stripe has no idea what a product is.** It holds an amount, not a slug, a
  course, or an entitlement.

The store knows all of it, so it sends it once, itself.

## Setup

1. Zapier → **Webhooks by Zapier → Catch Hook** → copy the URL.
2. Coolify → gi-membership → Environment → add:
   ```
   CRM_WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/…
   ```
3. Redeploy.

Unset means no-op — local development and the test suite never post anywhere.
There is no separate on/off flag: the presence of the URL *is* the flag.

## Event types

| `type` | Fires when |
|---|---|
| `purchase` | An order is paid and access is granted |
| `trial_started` | A subscription **transitions** into trialing |
| `subscription_active` | Trial converts, or a past_due subscription recovers |
| `subscription_canceled` | Subscription ends — access revoked |
| `subscription_past_due` | Renewal failed; still has access while Stripe retries |
| `refunded` | Refunded from Admin → Orders, or a Stripe refund |

**A purchase whose bump is a trial sends `purchase` with `trialStarted: true`,
not `trial_started`.** The buyer did both, and typing it as only the trial would
drop the customer tag. Apply both tags off the one event.

Subscription events fire **only on real transitions**. Stripe sends
`customer.subscription.updated` for renewals, card updates and metadata edits;
the store compares against the stored status first, so the CRM does not receive
a "went active" event every month for the life of a subscription.

## Payload

Real captured event — a $27 product with the Content Engine trial bump:

```json
{
  "type": "purchase",
  "trialStarted": true,
  "email": "buyer@example.com",
  "occurredAt": 1785475169,
  "orderId": "fbea82f2-a3b0-4b7a-b8e3-ee139e5b14db",
  "productSlug": "placeholder-offer",
  "totalCents": 2700,
  "currency": "usd",
  "items": [
    { "kind": "product", "description": "Placeholder Product ($27)", "amountCents": 2700, "productSlug": "placeholder-offer" },
    { "kind": "bump",    "description": "Content Engine — Monthly (7-day trial)", "amountCents": 0, "productSlug": null }
  ]
}
```

Subscription and refund events are thinner — `type`, `email`, `occurredAt`, and
`stripeSubscriptionId` or `orderId`.

| Field | Notes |
|---|---|
| `email` | The join key for ActiveCampaign |
| `productSlug` | **Tag on this.** Stable; survives a product rename |
| `items[].description` | Display copy. Changes when a product is renamed — don't key logic on it |
| `items[].kind` | `product` \| `bump` \| `oto` — mirrors the `order_items` constraint |
| `amountCents` / `totalCents` | Integer cents, never a float |
| `occurredAt` | Unix seconds |

`productSlug` is set on the base item and on the event itself. Bump and OTO
items carry `null` — they grant an *offer*, which may be app access rather than
a catalogue product; use `description` for those.

## Building the Zap

1. Trigger: **Catch Hook**
2. Filter: `type` exactly matches `purchase` (one Zap per type, or branch on it)
3. ActiveCampaign → add tag → use `productSlug` directly as the tag name

That last step is what makes it scale: a new product tags itself, with no new
Zap. Nothing to update when the catalogue grows.

For trials, add a path on `trialStarted` = `true` in the same Zap rather than a
second trigger.

## Failure behaviour

Fire-and-forget with a 5s timeout. It **never throws** — these calls sit inside
`finalizeOrder`, after the money has moved, and a Zapier outage must not turn a
paid order into an error. A failure is logged to the container console and
nothing else.

That is the accepted trade: a CRM outage silently loses tags for its duration.
Nothing writes `error_events` yet, so there is no alert and no replay. If a Zap
looks empty, check the container logs for `[crm]` before assuming no sales.

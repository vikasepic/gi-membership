# Affiliate tracker

Set up 10 Nov 2026 from the tracker's own setup sheet ("Affiliate Sale Webhook, Setup for Foundations Weekend"). The tracker is a separate Greater Inside service at `https://mindvalley.greaterinside.com/api/webhooks/sale`; it decides from the buyer's email whether an affiliate sent them and works out the commission. Grow only reports what happened.

## What Grow sends

`lib/affiliate-tracker.ts`. One POST per tracked order line, header `x-webhook-secret` from the env var `AFFILIATE_WEBHOOK_SECRET` (production only; unset means nothing is sent).

| When | Body |
|---|---|
| A paid offer checkout completes (`completeOfferCheckout`) | `event: "sale"`, `amount_cents` = that line's charged amount (after coupon, bump excluded), `event_id: grow_<orderId>_<offerId>` |
| Stripe `charge.refunded` on that order | `event: "refund"`, `event_id: <stripe event id>_<offerId>`, `original_event_id` = the sale's id; `amount_cents` only when this refund is less than the line (a partial) |

Tracked offers are the keys in `TRACKED_OFFERS`. Today both Foundations Weekend pages, `foundation-weekend` and `foundations-weekend-mindvalley`, map to tracker product `prod_VTqGCl1V1x69ff`. To track another offer, the tracker registers it and hands over its product id; add one line.

Live orders only: a test purchase is nobody's commission. A network error or a 5xx queues an `affiliate_event` retry (same body; the `event_id` makes a repeat a `duplicate`). A 4xx or `unmatched_product` is logged on the Errors page, not retried.

## Not covered

- Foundations Weekend sold as a bump or an upsell (it is neither today): those lines are written by other paths and are not reported.
- Sales before 10 Nov 2026 were never sent.

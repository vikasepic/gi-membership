# Phase 6 — tracking, hardening, launch

Status as of 2026-07-27.

## Built and tested (no credentials required)

**Subscription lifecycle + dunning** — `lib/subscription-sync.ts`, wired into the
Stripe webhook. Previously the webhook handled only `payment_intent.succeeded`,
so nothing reacted when a trial converted, a card failed, or a customer
cancelled.

| Stripe event | Effect |
|---|---|
| `customer.subscription.updated` | ownership status follows the subscription (trial → active at day 7) |
| `customer.subscription.deleted` | ownership `canceled` — app access revoked |
| `invoice.payment_failed` | ownership `past_due` — **access retained** while Stripe retries |
| `invoice.payment_action_required` | ownership `past_due` — off-session 3DS at the day-7 conversion |
| `charge.refunded` | order marked refunded, purchased product ownership removed, granted subscription cancelled |

Two deliberate decisions:

- **`past_due` keeps access.** Stripe retries a failed renewal for days; cutting
  a customer off on the first failure punishes an expired card that is about to
  be recovered.
- **Unknown subscription statuses degrade to `past_due`, never `active`.** A
  status we do not recognise must not silently grant access.

**Server-side conversion tracking** — `lib/tracking.ts`, called from
`finalizeOrder`. Meta CAPI and GA4 Measurement Protocol are implemented.
Sending from the server (not the browser) means ad blockers and ITP cannot
silence conversions, and the day-7 trial conversion — which happens with no
browser present — can still be reported.

- The PaymentIntent id is the `event_id`, so a browser pixel sending the same
  value **deduplicates** against the server event.
- Emails are sha256-hashed after trim+lowercase (raw addresses never leave the
  server; skipping normalisation silently destroys match rates).
- **Fire-and-forget**: a tracking failure is logged and swallowed. It can never
  fail a paid order.
- **No credentials ⇒ no-op.** With no env vars set, nothing is sent and nothing
  breaks.

Tests: 86 passing, including real Stripe test-mode refunds proving revocation.

## Blocked on credentials (nothing to build until these arrive)

| Needed | For |
|---|---|
| `META_PIXEL_ID` + `META_CAPI_TOKEN` | Meta CAPI conversions |
| `GA4_MEASUREMENT_ID` + `GA4_API_SECRET` | GA4 Measurement Protocol |
| Google Ads conversion ID/label + OAuth | Enhanced Conversions, and offline import of the day-7 conversion |

Set them in Coolify env on the app and redeploy; the code activates itself.

## Consent (EU/UK confirmed — built 2026-07-27)

Ajit confirmed the store takes EU/UK traffic, so GDPR applies and tracking is
opt-in. `lib/consent.ts` fails closed: anything other than an explicit
`granted` means no tracking.

- Banner with **equal-weight Accept / Decline** (GDPR requires declining to be
  as easy as accepting), no pre-selection, no dismiss-as-consent.
- `/api/track` refuses to store click ids, UTMs or user agent without consent —
  verified: no cookie → refused, `denied` → refused, `granted` → stored.
- Consent is captured at checkout and stored on the order (`orders.tracking_consent`)
  because the Stripe webhook finalizes orders with **no cookies**; `finalizeOrder`
  will not send a conversion for an order that lacks consent.
- 180-day cookie, then the visitor is asked again.

## Stripe Tax (confirmed yes — built, OFF until activated)

Digital-services VAT is owed at the buyer's country rate, so checkout now
collects a **country** and the PaymentIntent charges `price + calculated tax`.
The sale is recorded as a Stripe Tax transaction for reporting.

**Currently disabled.** `STRIPE_TAX_ENABLED` is unset, and a probe against the
account returned: *"Stripe Tax has not been activated on your account."*

To turn it on:
1. Activate Stripe Tax at `dashboard.stripe.com/test/tax` (needs your business
   origin address).
2. **Add your VAT registrations.** Stripe only charges tax where you are
   registered — activating Tax does not by itself make you compliant, and for
   EU sales this usually means a UK VAT registration and/or EU OSS.
3. Set `STRIPE_TAX_ENABLED=true` in Coolify env and redeploy.
4. Re-run the money-path tests: the charged amount changes, so this is a
   money-path change, not a config tweak.

Until step 3, tax is zero and the money path behaves exactly as it does today.

## Deliberately not built

- **Browser pixel.** The server event is authoritative and dedupes on
  `event_id`; adding a browser pixel is a small follow-up once the pixel id
  exists, and is only needed for view/add-to-cart style events.

## Before running paid traffic

1. Add the credentials above and verify one live event lands in Events Manager /
   GA4 DebugView.
2. Activate Stripe Tax + add VAT registrations, then set STRIPE_TAX_ENABLED.
3. Point the Stripe **live** webhook at `/api/webhooks/stripe` with the live
   signing secret — the current endpoint is test mode only.

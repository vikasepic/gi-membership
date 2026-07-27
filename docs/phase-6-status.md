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

## Deliberately not built

- **Browser pixel.** The server event is authoritative and dedupes on
  `event_id`; adding a browser pixel is a small follow-up once the pixel id
  exists, and is only needed for view/add-to-cart style events.
- **Consent mode.** Still gated on an unanswered question: does this store take
  EU/UK traffic? If yes, consent mode is legally required before any tracking
  is switched on, because hashed email is still personal data under GDPR.
  Nothing is sent today, so there is no current exposure.
- **Stripe Tax.** Not enabled. Turning it on changes the amount charged, so it
  needs an explicit decision and a re-run of the money-path tests.

## Before running paid traffic

1. Add the credentials above and verify one live event lands in Events Manager /
   GA4 DebugView.
2. Answer the EU/UK question and add consent mode if yes.
3. Decide on Stripe Tax.
4. Point the Stripe **live** webhook at `/api/webhooks/stripe` with the live
   signing secret — the current endpoint is test mode only.

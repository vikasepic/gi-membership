/**
 * Fire one Purchase event at Meta's Conversions API, flagged as a test.
 *
 * Uses the store's own `buildMetaEvent`, so what Events Manager shows is the
 * payload production actually sends — not a hand-written lookalike that could
 * pass while the real one is broken.
 *
 * Run:
 *   META_PIXEL_ID=... META_CAPI_TOKEN=... \
 *     npx tsx --conditions=react-server scripts/send-test-purchase.ts
 *
 * The condition flag is what makes `server-only` resolve to its no-op export
 * outside Next's server build; without it the import throws before anything
 * is sent.
 *
 * The test code means Meta shows it in Test Events and counts it for NOTHING
 * else: no reporting, no optimisation. Safe to run against the live pixel.
 */
import { buildMetaEvent, type PurchaseEvent } from "../lib/tracking";
import { randomUUID } from "node:crypto";

const TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE ?? "TEST29461";
const PIXEL_ID = process.env.META_PIXEL_ID;
const TOKEN = process.env.META_CAPI_TOKEN;

if (!PIXEL_ID || !TOKEN) {
  console.error("Set META_PIXEL_ID and META_CAPI_TOKEN in the environment.");
  process.exit(1);
}

// The Digital Product Validator, at its live price ($19.00 USD).
const event: PurchaseEvent = {
  eventId: `test-${randomUUID()}`,
  eventName: "Purchase",
  email: "capi-test@greaterinside.com",
  valueCents: 19_00,
  currency: "usd",
  orderId: `test-${Date.now()}`,
  clickIds: {},
  sourceUrl: "https://grow.greaterinside.com/p/digital-product-validator",
  occurredAt: Math.floor(Date.now() / 1000),
  contentIds: ["digital-product-validator"],
  contentName: "Digital Product Validator",
  contentType: "product",
  numItems: 1,
};

const payload = buildMetaEvent(event, TEST_EVENT_CODE);

const res = await fetch(`https://graph.facebook.com/v21.0/${PIXEL_ID}/events`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ ...payload, access_token: TOKEN }),
});

const body = await res.json().catch(() => ({}));
console.log(`HTTP ${res.status}`);
console.log(JSON.stringify(body, null, 2));
console.log(`\nevent_id: ${event.eventId}`);
console.log(`test code: ${TEST_EVENT_CODE} — look under Events Manager → Test Events.`);
process.exit(res.ok ? 0 : 1);

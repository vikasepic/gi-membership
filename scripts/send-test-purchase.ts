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

/**
 * What to send. Defaults to the Digital Product Validator at its live price
 * ($19.00 USD); override to exercise a different funnel's rule:
 *
 *   --name "90 Day AI Team Build"   content_name, which is what a custom
 *                                   conversion's rule matches on
 *   --slug 90-day-ai                content_ids and the source URL
 *   --value 450000                  in CENTS
 *   --count 3                       how many to send, each with its own id
 */
function arg(flag: string, fallback: string): string {
  const i = process.argv.indexOf(`--${flag}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const NAME = arg("name", "Digital Product Validator");
const SLUG = arg("slug", "digital-product-validator");
const VALUE_CENTS = Number(arg("value", "1900"));
const COUNT = Math.max(1, Math.min(10, Number(arg("count", "1"))));
/**
 * `--live` sends with NO test code at all.
 *
 * A stale code and no code are not the same thing. A stale one is still a
 * `test_event_code` field on the payload, and while Meta's reply says the
 * event was "processed normally" and the dataset counts it, a custom
 * conversion created beforehand did not fire off three of them in 21 hours —
 * so the flag appears to keep them out of reporting after all. Omitting the
 * field is the only way to send something Meta treats as an ordinary sale.
 *
 * It IS an ordinary sale then: it counts, it optimises, it cannot be deleted.
 * Send 0 for the value unless a real amount is the point.
 */
const LIVE = process.argv.includes("--live");
/**
 * The funnel's own event name, sent beside Purchase exactly as a real offer
 * sale sends it (lib/checkout.ts trackOfferSale). Meta optimises on Purchase
 * and cannot do that on a custom name, so this never replaces it.
 */
const CUSTOM = arg("custom", "");

// Wrapped rather than left at the top level: this package has no
// `"type": "module"`, so tsx compiles the file as CJS and a top-level `await`
// is a transform error before a single line runs.
async function send(event: PurchaseEvent, label: string): Promise<{ ok: boolean; stale: boolean }> {
  // `--live` omits the field entirely; anything else carries the code.
  const payload = buildMetaEvent(event, LIVE ? undefined : TEST_EVENT_CODE);

  const res = await fetch(`https://graph.facebook.com/v21.0/${PIXEL_ID}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...payload, access_token: TOKEN }),
  });

  const body = await res.json().catch(() => ({}));
  console.log(`  ${label}  HTTP ${res.status}  event_id=${event.eventId}`);
  console.log(`      ${JSON.stringify(body)}`);
  const messages = JSON.stringify((body as { messages?: unknown }).messages ?? []);
  return { ok: res.ok, stale: /does not match an active Test Events session/i.test(messages) };
}

async function main(): Promise<number> {
  let failed = 0;
  console.log(
    LIVE
      ? `LIVE mode: no test code. These count as real ${NAME} purchases at ` +
          `${VALUE_CENTS / 100} USD each and cannot be deleted.\n`
      : `test code ${TEST_EVENT_CODE} — only a test while that exact code has an ` +
          `OPEN Test Events session.\n`,
  );

  for (let n = 0; n < COUNT; n++) {
    const stamp = `${Date.now()}-${n}`;
    const base = {
      email: "capi-test@greaterinside.com",
      valueCents: VALUE_CENTS,
      currency: "usd",
      orderId: `test-${stamp}`,
      clickIds: {},
      sourceUrl: `https://grow.greaterinside.com/p/${SLUG}`,
      occurredAt: Math.floor(Date.now() / 1000),
      contentIds: [SLUG],
      contentName: NAME,
      contentType: "product",
      numItems: 1,
    };

    console.log(`[${n + 1}/${COUNT}] content_name=${JSON.stringify(NAME)} value=${VALUE_CENTS / 100} USD`);

    const purchase = await send(
      { ...base, eventId: `capi-${randomUUID()}`, eventName: "Purchase" },
      "Purchase        ",
    );
    if (!purchase.ok) failed++;

    // The funnel's own event, beside Purchase rather than instead of it —
    // the same pair a real offer sale sends.
    if (CUSTOM) {
      const named = await send(
        { ...base, eventId: `capi-${randomUUID()}`, eventName: "Purchase", customName: CUSTOM },
        `${CUSTOM.slice(0, 16).padEnd(16)}`,
      );
      if (!named.ok) failed++;
    }

    // A stale code is not an error and not a test. Meta ingests the event —
    // the dataset counts it — while a custom conversion created beforehand did
    // not fire off three of them in 21 hours, so it does not reach reporting
    // either. Neither one thing nor the other: stop and let a human choose.
    if (purchase.stale) {
      console.error(
        `\n!! STALE TEST CODE. ${TEST_EVENT_CODE} matches no open Test Events session,\n` +
          `   so this is neither a visible test nor a reliable live event.\n` +
          `   Either open Events Manager -> Test Events and use the code shown there,\n` +
          `   or pass --live to send a real one on purpose.\n` +
          `   Stopping after ${n + 1} of ${COUNT}.`,
      );
      return failed + 1;
    }
  }

  // Never a success line over failures. Six events were refused for a bad
  // token on 21 Oct 2026 and this still printed "Sent live", which reads as
  // confirmation that something landed — the same shape of lie as a stale test
  // code reporting 200.
  if (failed) {
    console.error(
      `\n!! NOTHING SENT: ${failed} of ${COUNT * (CUSTOM ? 2 : 1)} events were refused.\n` +
        `   Read the error above. "Cannot parse access token" means META_CAPI_TOKEN\n` +
        `   was not substituted — check it is the real value, not a placeholder.`,
    );
    return failed;
  }
  console.log(
    LIVE
      ? "\nSent live. Allow ~20 minutes, then check the custom conversion's last_fired_time."
      : "\nLook under Events Manager → Test Events.",
  );
  return failed;
}

main().then(
  (failed) => process.exit(failed ? 1 : 0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);

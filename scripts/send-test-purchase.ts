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

// Wrapped rather than left at the top level: this package has no
// `"type": "module"`, so tsx compiles the file as CJS and a top-level `await`
// is a transform error before a single line runs.
async function main(): Promise<number> {
  let failed = 0;
  for (let n = 0; n < COUNT; n++) {
    const event: PurchaseEvent = {
      eventId: `test-${randomUUID()}`,
      eventName: "Purchase",
      email: "capi-test@greaterinside.com",
      valueCents: VALUE_CENTS,
      currency: "usd",
      orderId: `test-${Date.now()}-${n}`,
      clickIds: {},
      sourceUrl: `https://grow.greaterinside.com/p/${SLUG}`,
      occurredAt: Math.floor(Date.now() / 1000),
      contentIds: [SLUG],
      contentName: NAME,
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
    if (!res.ok) failed++;
    console.log(`[${n + 1}/${COUNT}] HTTP ${res.status}  event_id=${event.eventId}`);
    console.log(`         content_name=${JSON.stringify(NAME)}  value=${VALUE_CENTS / 100} USD`);
    console.log(`         ${JSON.stringify(body)}`);

    // A test code that matches no OPEN Test Events session is not an error and
    // not a test: Meta says so in `messages` and then processes the event
    // normally — into reporting, into optimisation, into every custom
    // conversion whose rule it matches. Three $4,500 "tests" entered the live
    // pixel this way on 20 Oct 2026. The code shown in the Test Events tab is
    // only live while that tab is open, so this is the common case, not the
    // rare one. Loud, and it stops the run.
    const messages = JSON.stringify((body as { messages?: unknown }).messages ?? []);
    if (/does not match an active Test Events session/i.test(messages)) {
      console.error(
        `\n!! NOT A TEST. Meta processed that event normally: it counts as a real\n` +
          `   ${NAME} purchase worth ${VALUE_CENTS / 100} USD and cannot be deleted.\n` +
          `   Open Events Manager -> Test Events, copy the code shown there into\n` +
          `   META_TEST_EVENT_CODE, and run again. Stopping after ${n + 1} of ${COUNT}.`,
      );
      return failed + 1;
    }
  }

  console.log(`\ntest code: ${TEST_EVENT_CODE} — look under Events Manager → Test Events.`);
  console.log("Test-coded events are excluded from reporting, optimisation and custom conversions.");
  return failed;
}

main().then(
  (failed) => process.exit(failed ? 1 : 0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);

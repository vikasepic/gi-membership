/**
 * Send Purchase events to Meta's Conversions API, built by the store's own
 * `buildMetaEvent` so Events Manager shows the payload production actually
 * sends, not a hand-written lookalike that could pass while the real one is
 * broken.
 *
 * Two modes, and only the first is safe:
 *
 *   default   carries a test code. Meta shows the event in Test Events and
 *             keeps it out of reporting, but ONLY while that exact code has an
 *             open Test Events session. A stale code is processed normally;
 *             the script spots that in Meta's reply and stops.
 *   --live    carries no test code. Every event is a real sale: it counts, it
 *             optimises, and it cannot be deleted. Requires an explicit
 *             --value so nobody sends real revenue by accident.
 *
 * Run:
 *   META_PIXEL_ID=... META_CAPI_TOKEN=... \
 *     npx tsx --conditions=react-server scripts/send-test-purchase.ts
 *
 * The condition flag is what makes `server-only` resolve to its no-op export
 * outside Next's server build; without it the import throws before anything
 * is sent.
 */
import { buildMetaEvent, type PurchaseEvent } from "../lib/tracking";
import { customEventIdFor } from "../lib/analytics/events";
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
 *   --value 450000                  in CENTS (required with --live)
 *   --count 3                       how many to send, 1 to 10
 *   --custom "90 Day AI Team Build Sale"
 *                                   also send the funnel's own named event
 *   --live                          no test code; see the header
 */
function arg(flag: string, fallback: string): string {
  const i = process.argv.indexOf(`--${flag}`);
  if (i === -1) return fallback;
  const value = process.argv[i + 1];
  // A missing value, or the next flag in its place, is a mistake rather than a
  // value: `--custom --live` would otherwise send a live event named "--live".
  if (!value || value.startsWith("--")) {
    console.error(`--${flag} needs a value.`);
    process.exit(1);
  }
  return value;
}

/** A whole number in range, or stop. NaN would send nothing and still report success. */
function whole(flag: string, fallback: string, min: number, max: number): number {
  const raw = arg(flag, fallback);
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    console.error(`--${flag} must be a whole number from ${min} to ${max}; got ${JSON.stringify(raw)}.`);
    process.exit(1);
  }
  return n;
}

const LIVE = process.argv.includes("--live");
if (LIVE && !process.argv.includes("--value")) {
  console.error(
    "--live sends real, undeletable purchases. Pass --value explicitly\n" +
      "(--value 0 unless a real amount is the point).",
  );
  process.exit(1);
}

const NAME = arg("name", "Digital Product Validator");
const SLUG = arg("slug", "digital-product-validator");
const VALUE_CENTS = whole("value", "1900", 0, 10_000_000);
const COUNT = whole("count", "1", 1, 10);
/**
 * The funnel's own event name, sent beside Purchase the way a real offer sale
 * sends it (lib/checkout.ts trackOfferSale): same `customEventIdFor` id, so
 * the browser and server copies would dedupe exactly as production's do.
 * Meta optimises on Purchase and cannot on a custom name, so this never
 * replaces it.
 */
const CUSTOM = process.argv.includes("--custom") ? arg("custom", "") : "";

type Sent = { ok: boolean; stale: boolean };

async function send(event: PurchaseEvent, label: string): Promise<Sent> {
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

function staleStop(sentSoFar: number): number {
  console.error(
    `\n!! STALE TEST CODE. ${TEST_EVENT_CODE} matches no open Test Events session,\n` +
      `   so Meta processed that event normally: the dataset counts it and it\n` +
      `   cannot be deleted. Open Events Manager -> Test Events and use the code\n` +
      `   shown there, or pass --live to send a real one on purpose.\n` +
      `   Stopped after ${sentSoFar} event(s).`,
  );
  return 1;
}

// Wrapped rather than left at the top level: this package has no
// `"type": "module"`, so tsx compiles the file as CJS and a top-level `await`
// is a transform error before a single line runs.
async function main(): Promise<number> {
  const planned = COUNT * (CUSTOM ? 2 : 1);
  let accepted = 0;
  let refused = 0;
  console.log(
    LIVE
      ? `LIVE mode: no test code. These count as real ${NAME} purchases at ` +
          `${VALUE_CENTS / 100} USD each and cannot be deleted.\n`
      : `test code ${TEST_EVENT_CODE}: only a test while that exact code has an ` +
          `OPEN Test Events session.\n`,
  );

  for (let n = 0; n < COUNT; n++) {
    const orderId = `test-${Date.now()}-${n}`;
    const base = {
      email: "capi-test@greaterinside.com",
      valueCents: VALUE_CENTS,
      currency: "usd",
      orderId,
      clickIds: {},
      sourceUrl: `https://grow.greaterinside.com/p/${SLUG}`,
      occurredAt: Math.floor(Date.now() / 1000),
      contentIds: [SLUG],
      contentName: NAME,
      contentType: "product",
      numItems: 1,
    };

    console.log(`[${n + 1}/${COUNT}] content_name=${JSON.stringify(NAME)} value=${VALUE_CENTS / 100} USD`);

    // Sequential on purpose, Purchase first: its reply is what tells us whether
    // the test code is stale, and nothing else may go out until we know.
    const purchase = await send(
      { ...base, eventId: `capi-${randomUUID()}`, eventName: "Purchase" },
      "Purchase        ",
    );
    if (purchase.ok) accepted++;
    else refused++;
    if (purchase.stale) return staleStop(accepted + refused);

    // The funnel's own event, beside Purchase rather than instead of it: the
    // same pair a real offer sale sends.
    if (CUSTOM) {
      const named = await send(
        { ...base, eventId: customEventIdFor(CUSTOM, orderId), eventName: "Purchase", customName: CUSTOM },
        `${CUSTOM.slice(0, 16).padEnd(16)}`,
      );
      if (named.ok) accepted++;
      else refused++;
      if (named.stale) return staleStop(accepted + refused);
    }
  }

  // Never a success line over failures, and never "nothing" when something
  // landed. Six events were refused for a bad token on 21 Oct 2026 and this
  // still printed "Sent live"; a partial failure reported as total would send
  // the operator back to rerun what already counted.
  if (refused) {
    console.error(
      `\n!! ${accepted} of ${planned} accepted, ${refused} refused.` +
        (accepted && LIVE ? ` The ${accepted} accepted are real and cannot be deleted; do not rerun them.` : "") +
        `\n   Read the error above. "Cannot parse access token" means META_CAPI_TOKEN\n` +
        `   was not substituted: check it is the real value, not a placeholder.`,
    );
    return 1;
  }
  console.log(
    LIVE
      ? `\nSent ${accepted} live. Arrival is proven by the dataset's stats for this hour,\n` +
          `not by a custom conversion's last_fired_time (docs/lessons.md, 21 Oct 2026).`
      : "\nLook under Events Manager -> Test Events.",
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);

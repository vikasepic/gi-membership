import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * What happens when the order bump cannot be charged.
 *
 * The bump is a SEPARATE off-session charge on the card the product was bought
 * with, and off-session charges genuinely fail — that is what dunning is for.
 * It used to be unguarded inside finalizeOrder, so a declined add-on threw out
 * of a purchase that had already succeeded: the thank-you route errored, the
 * Stripe webhook retried the whole finalize behind it, the buyer kept the
 * product, never got the add-on, and nothing anywhere said so.
 *
 * Asserted against the source rather than by running the money path, which
 * needs Stripe. The integration suite covers the happy path; what this pins is
 * the SHAPE of the failure handling, which is the part that was missing and the
 * part a refactor would quietly undo.
 */

const checkout = readFileSync("lib/checkout.ts", "utf8");
const retry = readFileSync("lib/retry.ts", "utf8");
const errors = readFileSync("lib/errors.ts", "utf8");
const offerCheckout = readFileSync("lib/offer-checkout.ts", "utf8");

/** The body of a named function, to the next top-level `export`. */
function bodyOf(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`);
  expect(start, `${name} exists`).toBeGreaterThan(-1);
  const rest = src.slice(start + 10);
  const end = rest.indexOf("\nexport ");
  return end === -1 ? rest : rest.slice(0, end);
}

describe("a bump that cannot be charged", () => {
  const finalize = bodyOf(checkout, "finalizeOrder");

  it("does not take the paid order down with it", () => {
    // The product is bought and paid for by the time the bump is attempted.
    // Rethrowing would error the thank-you page on a successful purchase and
    // wedge the webhook retrying it.
    const bump = finalize.slice(finalize.indexOf("Fulfil the bump"));
    const guard = bump.slice(0, bump.indexOf("recordError") + 400);
    expect(guard).toContain("try {");
    expect(guard).toContain("catch");
    // Nothing rethrown out of that catch.
    expect(guard).not.toMatch(/catch[\s\S]{0,200}\bthrow\b/);
  });

  it("queues the charge for another go rather than dropping it", () => {
    expect(finalize).toContain('jobKind: "bump_charge"');
    // With everything the replay needs — a payload missing the payment method
    // or the customer is a job that can only ever fail.
    for (const key of [
      "orderId",
      "storeId",
      "userId",
      "email",
      "stripeCustomerId",
      "offerId",
      "paymentMethodId",
    ]) {
      // `key:` or the shorthand `key,` — both are the property being carried.
      expect(finalize, `payload carries ${key}`).toMatch(new RegExp(`${key}[:,]`));
    }
  });

  it("replays through the same code the purchase runs", () => {
    // Not a second implementation. A replay that granted access without
    // charging — or charged without granting — would be worse than the failure
    // it was replaying.
    expect(retry).toContain("bump_charge:");
    expect(retry).toContain("fulfilBump(");
    expect(checkout).toContain("export async function fulfilBump");
  });

  it("lets the sweep see the failure by throwing inside the runner", () => {
    // The runners report failure by throwing; a runner that swallowed it would
    // have the sweep mark still-broken work resolved.
    const runner = retry.slice(retry.indexOf("bump_charge:"), retry.indexOf("crm_event:"));
    expect(runner).toContain("await fulfilBump(");
    expect(runner).not.toContain("catch");
  });
});

describe("running the bump twice", () => {
  const fulfil = bodyOf(checkout, "fulfilBump");

  it("cannot bill twice", () => {
    // fulfilOffer keys its Stripe call on order+offer, so the retry that
    // finally succeeds cannot charge again for the attempts before it. This
    // asserts the helper leans on that rather than passing its own key.
    expect(fulfil).toContain("fulfilOffer(");
    expect(fulfil).not.toContain("idempotencyKey");
  });

  it("cannot double the recorded revenue", () => {
    // ownership tolerates its unique violation; order_items has no constraint
    // to lean on, so a replay would otherwise append a second paid line to an
    // order that was charged once.
    const guard = fulfil.slice(0, fulfil.indexOf(".insert("));
    expect(guard).toContain('.eq("kind", "bump")');
    expect(guard).toContain("if (already) return;");
  });

  it("gives up on an offer that has been withdrawn", () => {
    // Returning, not throwing: there is nothing here a retry can fix, so
    // queueing one would sweep the same dead job until it ran out of attempts.
    expect(fulfil).toMatch(/if \(!offer\?\.active\) return;/);
  });
});

describe("the job kind", () => {
  it("is one the dispatcher knows", () => {
    // Record<JobKind, Runner> makes this a compile error rather than a runtime
    // one, which is the reason the union is worth keeping narrow.
    expect(errors).toContain('"bump_charge"');
  });
});

// The offer checkout's own two bump-failure records — a different function
// (completeOfferCheckout, lib/offer-checkout.ts) from finalizeOrder above, and
// the two records inside it must NOT be handled alike: one is a genuine
// fulfilBump failure that a retry can fix, the other is a bump that was paid
// for but can never be resolved (the offer is inactive BY DEFINITION in that
// branch) — queueing THAT one would let the sweep "resolve" it on its first
// pass, since fulfilBump returns rather than throws on an inactive offer.
describe("the offer checkout's own bump failures", () => {
  const complete = bodyOf(offerCheckout, "completeOfferCheckout");
  // Genuine failure: the fulfilBump call that can actually throw, up to (not
  // including) the branch below it.
  const genuineFailure = complete.slice(
    complete.indexOf("if (bumpOfferId && bumpRaw?.active)"),
    complete.indexOf("else if (bumpUnresolved)"),
  );
  // The unresolvable-but-paid-for branch, from the recordError CALL itself
  // (not the comment above it, which spells out "jobKind"/"jobPayload" in
  // prose to explain their absence — a substring check from there would
  // trip on the explanation rather than the code) to the end of the function
  // — its last branch, so this is also the end of the sliced body.
  const unresolvable = complete.slice(complete.indexOf("await recordError({", complete.indexOf("else if (bumpUnresolved)")));

  it("still queues a retry for a fulfilBump that actually threw", () => {
    // This one CAN succeed on replay, so it must stay retryable.
    expect(genuineFailure).toContain('jobKind: "bump_charge"');
    expect(genuineFailure).toContain("jobPayload: {");
  });

  it("only logs a paid bump that can never be resolved — never queues it", () => {
    // recordError queues a retry only when BOTH jobKind and jobPayload are
    // given (see lib/errors.ts). Neither may appear in the call here, or the
    // sweep would run this "job", see fulfilBump no-op without throwing, and
    // mark it resolved within a minute — erasing the visibility this record
    // exists to give.
    expect(unresolvable).not.toContain("jobKind");
    expect(unresolvable).not.toContain("jobPayload");
  });

  it("still names the offer, the buyer, and what was paid", () => {
    // The only place left to carry this once jobPayload is gone.
    expect(unresolvable).toContain("offerId: bumpOfferId");
    expect(unresolvable).toMatch(/\bemail\b/);
    expect(unresolvable).toMatch(/\btotalCents\b/);
  });
});

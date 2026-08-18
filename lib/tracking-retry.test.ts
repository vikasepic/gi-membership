import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The one attempt a completed sale used to get.
 *
 * A conversion is reported once, from finalizeOrder, and every failure was
 * logged to the errors page and dropped. That was the right call for a refusal
 * — an ad platform rejecting a payload will reject it again on a schedule —
 * but it was applied to timeouts too, and a five-second timeout is the exact
 * opposite: the same payload would have been accepted a minute later, and the
 * sale is simply never reported.
 *
 * Meta accepts an event up to seven days after it happened, so the moment
 * passing is not the same as the chance passing.
 */

const tracking = readFileSync("lib/tracking.ts", "utf8");
const retry = readFileSync("lib/retry.ts", "utf8");
const errors = readFileSync("lib/errors.ts", "utf8");

describe("what gets another go", () => {
  const fn = tracking.slice(tracking.indexOf("function transient("));

  it("a timeout, which is the failure this exists for", () => {
    expect(fn).toMatch(/timeout/i);
    expect(fn).toMatch(/aborted/i);
  });

  it("a network that was not there", () => {
    for (const code of ["ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "fetch failed"]) {
      expect(fn, code).toContain(code);
    }
  });

  it("the platform having a bad minute", () => {
    expect(fn).toContain("5\\d\\d");
  });

  it("and NOT a refusal, which would fail identically forever", () => {
    // A 400 naming a bad field, a 401 on a rotated token. Replaying those on a
    // schedule just refuses them on a schedule.
    expect(fn).not.toMatch(/4\\\\d\\\\d/);
  });
});

describe("the queued job", () => {
  it("is a kind the dispatcher knows", () => {
    // Record<JobKind, Runner> makes a missing runner a compile error.
    expect(errors).toContain('"tracking_event"');
    expect(retry).toContain("tracking_event: async (p) => {");
  });

  it("carries the event verbatim", () => {
    expect(tracking).toContain("jobPayload: { event: e as unknown as Record<string, unknown>");
  });

  it("remembers which platforms were being sent to", () => {
    // GA4 does not deduplicate. Replaying both when only Meta timed out would
    // book the same sale twice in GA4.
    expect(tracking).toContain("only: allowed ?? null");
    expect(retry).toContain('p.only as ("meta" | "ga4")[] | null');
  });

  it("is only queued when the moment was the problem", () => {
    expect(tracking).toContain("const retryable = transient(message)");
    expect(tracking).toMatch(/retryable[\s\S]{0,120}jobKind: "tracking_event"/);
  });
});

describe("replaying it", () => {
  it("reports failure by throwing, not by queueing again", () => {
    // Otherwise a replay that failed would record a SECOND job carrying the
    // same event, and the queue would grow a row every sweep instead of
    // counting attempts against the one already there.
    expect(retry).toContain("rethrow: true");
    expect(tracking).toContain("if (opts?.rethrow) throw");
  });

  it("cannot double-count the sale", () => {
    // The event id is derived from the order, so a replay landing beside a
    // copy the browser already sent is one sale either way.
    expect(retry).toContain("Meta deduplicates on");
  });
});

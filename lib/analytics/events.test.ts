import { describe, it, expect } from "vitest";
import { EVENTS, GA4_NAME, META_BOTH_SIDES, SERVER_ONLY, NO_VALUE, eventIdFor } from "@/lib/analytics/events";

// The rules that decide whether a number in a dashboard is true.

describe("the event vocabulary", () => {
  it("gives every event a GA4 name", () => {
    // An event with no GA4 name is one that silently reports to Meta only.
    for (const e of EVENTS) expect(GA4_NAME[e], e).toBeTruthy();
  });

  it("calls a trial start and a conversion both purchases in GA4", () => {
    // GA4 has no trial concept. Two purchases — one of $0 today, one of the
    // real amount — is exactly how the revenue reads.
    expect(GA4_NAME.StartTrial).toBe("purchase");
    expect(GA4_NAME.Subscribe).toBe("purchase");
  });

  it("uses GA4's own vocabulary, not Meta's", () => {
    // A custom event named InitiateCheckout sits in GA4 as a stranger that
    // none of its built-in funnels understand.
    expect(GA4_NAME.InitiateCheckout).toBe("begin_checkout");
    expect(GA4_NAME.ViewContent).toBe("view_item");
  });
});

describe("which side each event is sent from", () => {
  it("sends money events to Meta from both sides", () => {
    // Meta deduplicates on event_id, so both sides raise match quality with
    // no double counting.
    expect(META_BOTH_SIDES).toContain("Purchase");
    expect(META_BOTH_SIDES).toContain("StartTrial");
  });

  it("never sends a trial conversion from a browser", () => {
    // It happens seven days later with nobody present.
    expect(SERVER_ONLY).toContain("Subscribe");
    expect(META_BOTH_SIDES).not.toContain("Subscribe");
  });

  it("keeps money off the events that have none", () => {
    // A ViewContent carrying a value invents revenue that shows up in ROAS.
    for (const e of ["ViewContent", "Lead", "PageView"] as const) {
      expect(NO_VALUE).toContain(e);
    }
    expect(NO_VALUE).not.toContain("Purchase");
  });
});

describe("the shared event id", () => {
  it("is the same on both sides when there is something stable to derive it from", () => {
    // The page and the webhook never speak to each other; this is the only
    // reason deduplication survives the redirect between them.
    expect(eventIdFor("Purchase", "order-123")).toBe(eventIdFor("Purchase", "order-123"));
  });

  it("keeps two different events on one order apart", () => {
    expect(eventIdFor("Purchase", "order-1")).not.toBe(eventIdFor("StartTrial", "order-1"));
  });

  it("keeps two orders apart", () => {
    expect(eventIdFor("Purchase", "order-1")).not.toBe(eventIdFor("Purchase", "order-2"));
  });

  it("is unique when there is nothing to derive it from", () => {
    expect(eventIdFor("ViewContent")).not.toBe(eventIdFor("ViewContent"));
  });
});

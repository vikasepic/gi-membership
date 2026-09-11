import { describe, it, expect } from "vitest";
import { isMetaId, namedLabel, namedLabels, nameMetadata } from "@/lib/meta-id";

/**
 * Turning Meta's object ids back into names.
 *
 * Most of this account's ads use Meta's DEFAULT dynamic parameters, so
 * utm_campaign / utm_term / utm_content arrive as 18-digit ids and the ledger
 * rendered them verbatim. A minority of campaigns use the ads team's own
 * template and already send real names, which is why every rule here is about
 * leaving a non-id completely alone.
 */

const NAMES = {
  "120250826827780282": "AJ | Product Validator | Sales | Relaunch",
  "120250826827840282": "DPV | Advantage+ Broad",
};

describe("recognising a Meta id", () => {
  it("accepts the 18-digit ids this account actually emits", () => {
    expect(isMetaId("120250826827780282")).toBe(true);
  });

  it("leaves a real campaign name alone", () => {
    expect(isMetaId("AJ | Product Validator | Sales | Relaunch")).toBe(false);
    expect(isMetaId("meta")).toBe(false);
    expect(isMetaId("paid_social")).toBe(false);
  });

  it("does not claim a short number is an id", () => {
    // A campaign genuinely named "2026" must not be hidden behind a lookup
    // that will always miss. The floor is far above anything anybody types.
    expect(isMetaId("2026")).toBe(false);
    expect(isMetaId("120250826")).toBe(false);
  });
});

describe("swapping in the name", () => {
  it("replaces a known id", () => {
    expect(namedLabel("120250826827780282", NAMES)).toBe("AJ | Product Validator | Sales | Relaunch");
  });

  it("keeps an unknown id rather than blanking it", () => {
    // Two of the ad ids in production resolve to nothing — deleted ads. The id
    // is still the only honest thing to show.
    expect(namedLabel("120250765617330282", NAMES)).toBe("120250765617330282");
  });

  it("passes a real name straight through, even with no map at all", () => {
    expect(namedLabel("AJ | LAL | Book Writer", {})).toBe("AJ | LAL | Book Writer");
  });

  it("resolves across a whole label set without disturbing the others", () => {
    expect(
      namedLabels(
        {
          utm_source: "fb",
          utm_medium: "paid",
          utm_campaign: "120250826827780282",
          utm_term: "120250826827840282",
          utm_content: "120250765617330282",
        },
        NAMES,
      ),
    ).toEqual({
      utm_source: "fb",
      utm_medium: "paid",
      utm_campaign: "AJ | Product Validator | Sales | Relaunch",
      utm_term: "DPV | Advantage+ Broad",
      utm_content: "120250765617330282",
    });
  });
});

describe("the name keys Stripe carries", () => {
  it("adds a _name key beside the id, never instead of it", () => {
    // The ads team's other platform filters on `utm_campaign`. Rewriting it in
    // place would fix one reader by breaking another.
    const labels = { utm_campaign: "120250826827780282", utm_term: "120250826827840282" };
    expect(nameMetadata(labels, NAMES)).toEqual({
      utm_campaign_name: "AJ | Product Validator | Sales | Relaunch",
      utm_term_name: "DPV | Advantage+ Broad",
    });
    // and the caller still spreads the raw keys itself
    expect(labels.utm_campaign).toBe("120250826827780282");
  });

  it("says nothing when the campaign already sends a real name", () => {
    // Those campaigns need no lookup — the name is already in utm_campaign,
    // and a duplicate _name key would just be noise in the dashboard.
    expect(nameMetadata({ utm_campaign: "AJ | LAL | Book Writer" }, NAMES)).toEqual({});
  });

  it("says nothing for an id it cannot name", () => {
    expect(nameMetadata({ utm_campaign: "120250765617330282" }, NAMES)).toEqual({});
  });

  it("ignores source and medium, which are never ids", () => {
    expect(nameMetadata({ utm_source: "fb", utm_medium: "paid" }, NAMES)).toEqual({});
  });
});

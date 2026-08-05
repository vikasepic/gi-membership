import { describe, it, expect } from "vitest";
import { lifecycleTagOps, type LifecycleTags } from "@/lib/ac-tags";

// The tags that tell a trial apart from a sale. These are the rules the list
// is segmented on, so what happens at each status is stated here rather than
// inferred from the CRM afterwards.

const ALL: LifecycleTags = { trial: "2", buyer: "3", cancelled: "4" };
const ops = (status: Parameters<typeof lifecycleTagOps>[1], tags = ALL) => lifecycleTagOps(tags, status);

describe("a trial that is running", () => {
  it("gets the trial tag and nothing else — no money has moved", () => {
    expect(ops("trialing")).toEqual({ add: ["2"], remove: [] });
  });

  it("takes nothing away — there is nothing yet to take", () => {
    expect(ops("trialing").remove).toEqual([]);
  });
});

describe("the first payment", () => {
  it("adds the buyer tag and takes the trial tag off", () => {
    expect(ops("active")).toEqual({ add: ["3"], remove: ["2"] });
  });

  it("is safe to apply again", () => {
    // Stripe sends customer.subscription.updated for a card change and a
    // renewal too. The same set applied twice is a no-op at ActiveCampaign,
    // which is why this is a map from status and not from transition.
    expect(ops("active")).toEqual(ops("active"));
  });

  it("takes the trial tag off an offer that never had a trial, harmlessly", () => {
    const noTrial = { ...ALL, trial: null };
    expect(ops("active", noTrial)).toEqual({ add: ["3"], remove: [] });
  });
});

describe("a card that is failing", () => {
  it("changes nothing, because nothing has been decided", () => {
    // Stripe is still retrying and they still have access. Untagging here
    // would drop someone out of their sequence over a card that then works.
    expect(ops("past_due")).toEqual({ add: [], remove: [] });
  });
});

describe("cancelling", () => {
  it("adds the cancelled tag and takes the buyer tag away", () => {
    expect(ops("canceled")).toEqual({ add: ["4"], remove: ["3"] });
  });

  it("LEAVES the trial tag — that is the whole point", () => {
    // Someone who cancels inside the trial never paid, and the trial tag is
    // the only record they were here at all.
    expect(ops("canceled").remove).not.toContain("2");
  });

  it("takes the buyer tag off, so a cancelled contact with no trial tag can only be one who paid", () => {
    expect(ops("canceled").remove).toContain("3");
  });

  it("never removes the cancelled tag, at any status", () => {
    for (const s of ["trialing", "active", "past_due", "canceled"] as const) {
      expect(ops(s).remove, s).not.toContain("4");
    }
  });
});

describe("the two segments this exists to build", () => {
  // Applying the ops in order and seeing what a contact ends up carrying.
  const run = (statuses: Parameters<typeof lifecycleTagOps>[1][]) => {
    const held = new Set<string>();
    for (const s of statuses) {
      const o = ops(s);
      o.remove.forEach((t) => held.delete(t));
      o.add.forEach((t) => held.add(t));
    }
    return held;
  };

  it("tried it, never paid, left → cancelled AND trial", () => {
    const held = run(["trialing", "canceled"]);
    expect([...held].sort()).toEqual(["2", "4"]);
  });

  it("paid, then left → cancelled and NOTHING else", () => {
    // One condition each, which is the point of taking the buyer tag off:
    // cancelled with a trial tag never paid; cancelled without one did.
    expect([...run(["trialing", "active", "canceled"])]).toEqual(["4"]);
  });

  it("bought outright, then left → also just cancelled", () => {
    expect([...run(["active", "canceled"])]).toEqual(["4"]);
  });

  it("still paying → just the buyer tag", () => {
    expect([...run(["trialing", "active"])]).toEqual(["3"]);
  });

  it("bought outright, no trial → just the buyer tag", () => {
    expect([...run(["active"])]).toEqual(["3"]);
  });

  it("cancelled once and came back → cancelled stays, buyer returns", () => {
    // This is why the cancelled tag alone cannot mean "churned": pair it with
    // the buyer tag, or a win-back campaign emails paying customers.
    expect([...run(["trialing", "active", "canceled", "active"])].sort()).toEqual(["3", "4"]);
  });

  it("cannot tell a former buyer's SECOND trial from a first one", () => {
    // The one case four tags cannot describe, pinned so it is a known limit
    // rather than a bug someone finds in the CRM: the buyer tag came off at
    // cancellation, so nothing contradicts the returning trial tag.
    const held = run(["trialing", "active", "canceled", "trialing"]);
    expect(held.has("2")).toBe(true);
    expect(held.has("3")).toBe(false);
  });
});

describe("offers with only some tags set", () => {
  it("emits nothing at all when none are configured", () => {
    const none: LifecycleTags = { trial: null, buyer: null, cancelled: null };
    for (const s of ["trialing", "active", "past_due", "canceled"] as const) {
      expect(lifecycleTagOps(none, s), s).toEqual({ add: [], remove: [] });
    }
  });

  it("works with the offer's own tag alone, as every existing offer has", () => {
    // The behaviour change on an existing trial offer: this tag used to land
    // when the trial STARTED and now lands when it converts.
    const legacy: LifecycleTags = { trial: null, buyer: "1", cancelled: null };
    expect(lifecycleTagOps(legacy, "trialing")).toEqual({ add: [], remove: [] });
    expect(lifecycleTagOps(legacy, "active")).toEqual({ add: ["1"], remove: [] });
    expect(lifecycleTagOps(legacy, "canceled")).toEqual({ add: [], remove: ["1"] });
  });
});

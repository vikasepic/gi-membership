import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * What reaches the database when an offer is saved.
 *
 * The prices are posted the way every list in this admin is posted — one hidden
 * input holding JSON — so the only thing standing between a typo in the browser
 * and a constraint error from Postgres is this schema. Every rule it enforces
 * is a rule the database ALSO states as a CHECK; the point of having it twice
 * is that one of the two can say what went wrong in words.
 */

const updated = vi.fn(async (_id: string, _input: unknown) => {});
const created = vi.fn(async (_input: unknown) => "new-id");

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("@/lib/admin-guard", () => ({ requireAdmin: async () => {} }));
// The form below always names an app, and saveOffer asks that app which
// channels it has before saving — a real database read. Both channels the
// store knows, so the filter it feeds is a no-op and the test stays about
// what is SENT, not what the apps table holds.
vi.mock("@/lib/apps", () => ({ appChannels: async () => ["instagram", "linkedin"] }));
vi.mock("@/lib/admin", () => ({
  createOffer: (i: unknown) => created(i),
  updateOffer: (id: string, i: unknown) => updated(id, i),
  deleteOffer: async () => {},
  listOfferOptions: async () => [],
}));

const { saveOffer } = await import("@/app/admin/offers/actions");

const ID = "00000000-0000-0000-0000-0000000000b1";

const PRICE = {
  id: "p1",
  label: "",
  billingType: "recurring",
  interval: "month",
  intervalCount: 1,
  trialDays: 7,
  priceCents: 2900,
  compareAtCents: null,
  archived: false,
};

function form(prices: unknown[], extra: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("id", ID);
  fd.set("key", "funnel-app");
  fd.set("name", "Funnel App");
  fd.set("grantType", "subscription");
  fd.set("grantAppId", "00000000-0000-0000-0000-0000000000c1");
  fd.set("headline", "Everything, monthly");
  fd.set("prices", JSON.stringify(prices));
  fd.set("currency", "usd");
  fd.set("acceptLabel", "Yes, add this");
  fd.set("declineLabel", "No thanks");
  // The form posts every field it renders, even the empty ones — the schema
  // turns "" into null rather than treating absent and empty as the same.
  for (const empty of [
    "grantProductId",
    "grantEntitlementKey",
    "description",
    "imageUrl",
    "bullets",
    "pageAltOfferId",
    "activecampaignTagId",
    "activecampaignTrialTagId",
    "activecampaignCancelledTagId",
    "otoBody",
    "otoVideoUrl",
  ]) {
    fd.set(empty, "");
  }
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  updated.mockClear();
  created.mockClear();
});

describe("saving the ways to pay", () => {
  it("carries every one of them through to the write", async () => {
    const yearly = { ...PRICE, id: "p2", interval: "year", priceCents: 29000, trialDays: null };
    const res = await saveOffer({}, form([PRICE, yearly]));
    expect(res.error, res.error).toBeFalsy();
    const input = updated.mock.calls[0][1] as { prices: unknown[] };
    expect(input.prices).toHaveLength(2);
    expect(input.prices[1]).toMatchObject({ interval: "year", priceCents: 29000 });
  });

  it("keeps the order they were put in", async () => {
    // The order is what the checkout shows them in. If the render order and
    // the server's rebuild of it ever differ, a buyer is charged the option
    // beside the one they ticked.
    const a = { ...PRICE, id: "a", priceCents: 100 };
    const b = { ...PRICE, id: "b", priceCents: 200 };
    await saveOffer({}, form([b, a]));
    const input = updated.mock.calls[0][1] as { prices: { id: string }[] };
    expect(input.prices.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("refuses a recurring price with no interval", async () => {
    // The database says the same thing as an inline CHECK. Reaching it would
    // give the person a Postgres message about a constraint they cannot find.
    const res = await saveOffer({}, form([{ ...PRICE, interval: null }]));
    expect(res.error).toBeTruthy();
    expect(updated).not.toHaveBeenCalled();
  });

  it("refuses a trial on a one-off, which cannot mean anything", async () => {
    const res = await saveOffer({}, form([{ ...PRICE, billingType: "one_time", trialDays: 7 }]));
    expect(res.error).toBeTruthy();
    expect(updated).not.toHaveBeenCalled();
  });

  it("refuses a was-price below the price, which reads as a markup", async () => {
    const res = await saveOffer({}, form([{ ...PRICE, compareAtCents: 100 }]));
    expect(res.error).toBeTruthy();
    expect(updated).not.toHaveBeenCalled();
  });

  it("refuses an offer with no way to pay at all", async () => {
    const res = await saveOffer({}, form([]));
    expect(res.error).toBeTruthy();
    expect(updated).not.toHaveBeenCalled();
  });

  it("refuses one where every way to pay is hidden", async () => {
    // Something has to be buyable, or the storefront quotes a price nobody can
    // choose — and the mirror on offers would go stale pointing at it.
    const res = await saveOffer({}, form([{ ...PRICE, archived: true }]));
    expect(res.error).toBeTruthy();
    expect(updated).not.toHaveBeenCalled();
  });

  it("says so in words rather than passing the JSON through", async () => {
    const res = await saveOffer({}, form([]));
    expect(res.error).not.toContain("{");
    expect(res.error?.length ?? 0).toBeGreaterThan(10);
  });

  it("survives a prices field that is not JSON at all", async () => {
    const fd = form([PRICE]);
    fd.set("prices", "not json");
    const res = await saveOffer({}, fd);
    expect(res.error).toBeTruthy();
    expect(updated).not.toHaveBeenCalled();
  });
});

describe("the offer's own Meta event name", () => {
  beforeEach(() => {
    updated.mockClear();
    created.mockClear();
  });

  it("reaches the database when it is typed", async () => {
    // It did not, and everything else about it was right. The column existed,
    // the type had the field, the row-builder wrote it and the form rendered
    // the input — but this action parses the post through its own schema, and
    // a field the schema does not name is dropped before it reaches any of
    // that. So the admin saved and the value silently vanished.
    await saveOffer({}, form([PRICE], { adEventName: "Upsell - Funnel App" }));
    expect(updated).toHaveBeenCalled();
    expect(updated.mock.calls[0][1]).toMatchObject({ adEventName: "Upsell - Funnel App" });
  });

  it("treats blank as no event rather than as an empty name", async () => {
    await saveOffer({}, form([PRICE], { adEventName: "   " }));
    expect(updated.mock.calls[0][1]).toMatchObject({ adEventName: null });
  });

  it("refuses a name Meta would silently drop", async () => {
    const res = await saveOffer({}, form([PRICE], { adEventName: "x".repeat(41) }));
    expect(res.error).toMatch(/40 characters/);
    expect(updated).not.toHaveBeenCalled();
  });

  it("saves the content name beside it, as its own field", async () => {
    // The event name and the content name are different things — one names the
    // event, the other names what was bought — and this schema drops any field
    // it does not name, which is how the event name silently vanished once.
    await saveOffer({}, form([PRICE], { contentName: "Funnel App - Upsell" }));
    expect(updated.mock.calls[0][1]).toMatchObject({ contentName: "Funnel App - Upsell" });
  });

  it("treats a blank content name as unset, so the offer name still reports", async () => {
    await saveOffer({}, form([PRICE], { contentName: "   " }));
    expect(updated.mock.calls[0][1]).toMatchObject({ contentName: null });
  });
});

describe("where the offer sits on the storefront", () => {
  beforeEach(() => {
    updated.mockClear();
    created.mockClear();
  });

  it("saves the position that was typed", async () => {
    await saveOffer({}, form([PRICE], { homeOrder: "2" }));
    expect(updated.mock.calls[0][1]).toMatchObject({ homeOrder: 2 });
  });

  it("treats blank as off the storefront, not as position zero", async () => {
    // A number input posts "" when cleared and Number("") is 0 — which the
    // column's CHECK refuses and the page would read as a real position.
    await saveOffer({}, form([PRICE], { homeOrder: "" }));
    expect(updated.mock.calls[0][1]).toMatchObject({ homeOrder: null });
  });

  it("refuses a position the column could not hold", async () => {
    const res = await saveOffer({}, form([PRICE], { homeOrder: "0" }));
    expect(res.error).toMatch(/first position is 1/);
    expect(updated).not.toHaveBeenCalled();
  });
});

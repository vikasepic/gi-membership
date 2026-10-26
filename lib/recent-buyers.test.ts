import { describe, it, expect } from "vitest";
import { displayFirstName, selectRecentBuyers, type PurchaseRow } from "@/lib/recent-buyers";

/**
 * Which purchases become cards in the recent buyers popup. The rules here are
 * the ones that need no database: the window, the names, who repeats.
 */

const now = new Date("2026-10-26T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
let n = 0;
const row = (over: Partial<PurchaseRow> = {}): PurchaseRow => {
  n += 1;
  return {
    orderId: `o${n}`,
    userId: `u${n}`,
    createdAt: hoursAgo(1),
    username: "Priya Sharma",
    country: "IN",
    itemKind: "product",
    offerId: "offer-a",
    productId: null,
    grantProductId: null,
    itemName: "Book to Bestseller",
    imageUrl: "https://img/btb.webp",
    verb: "enrolled in",
    ...over,
  };
};

describe("displayFirstName", () => {
  it("takes the first word of a full name", () => {
    expect(displayFirstName("priya sharma")).toBe("Priya");
  });

  it("recases a name typed all in capitals or all in lower case, and leaves mixed case alone", () => {
    expect(displayFirstName("PRIYA")).toBe("Priya");
    expect(displayFirstName("McKenzie Hart")).toBe("McKenzie");
  });

  it("keeps accents, apostrophes and other scripts exactly as typed", () => {
    expect(displayFirstName("José Luis")).toBe("José");
    expect(displayFirstName("O'Neil")).toBe("O'Neil");
    expect(displayFirstName("李明")).toBe("李明");
  });

  it("refuses anything that is not a usable first name", () => {
    for (const bad of ["jane@gmail.com", "", null, "J", "test", "Test User", "asdf", "user123", "n/a"]) {
      expect(displayFirstName(bad)).toBeNull();
    }
  });
});

describe("selectRecentBuyers", () => {
  it("keeps the last 14 days and nothing older", () => {
    const kept = row({ createdAt: hoursAgo(14 * 24 - 1), username: "Keep" });
    const old = row({ createdAt: hoursAgo(15 * 24), username: "Drop" });
    const names = selectRecentBuyers([kept, old], { kind: "home" }, now).map((c) => c.firstName);
    expect(names).toEqual(["Keep"]);
  });

  it("puts the newest first", () => {
    const rows = [row({ createdAt: hoursAgo(5), username: "Older" }), row({ createdAt: hoursAgo(1), username: "Newer" })];
    expect(selectRecentBuyers(rows, { kind: "home" }, now).map((c) => c.firstName)).toEqual(["Newer", "Older"]);
  });

  it("shows at most 20", () => {
    const rows = Array.from({ length: 25 }, (_, i) => row({ createdAt: hoursAgo(i + 1) }));
    expect(selectRecentBuyers(rows, { kind: "home" }, now)).toHaveLength(20);
  });

  it("skips a purchase with no usable name rather than saying Someone", () => {
    expect(selectRecentBuyers([row({ username: "test" })], { kind: "home" }, now)).toEqual([]);
  });

  it("never shows the viewer their own purchase", () => {
    const mine = row({ userId: "me" });
    const theirs = row();
    expect(selectRecentBuyers([mine, theirs], { kind: "home" }, now, "me")).toHaveLength(1);
  });

  it("keeps only the offer's own buyers on an offer page", () => {
    const rows = [row({ offerId: "offer-a", username: "Ana" }), row({ offerId: "offer-b", username: "Ben" })];
    expect(selectRecentBuyers(rows, { kind: "offer", id: "offer-a" }, now).map((c) => c.firstName)).toEqual(["Ana"]);
  });

  it("counts a product page's buyers whichever way they got it, once each", () => {
    const direct = row({ offerId: null, productId: "p1", userId: "same", createdAt: hoursAgo(3), username: "Mia" });
    const viaOffer = row({ offerId: "offer-x", grantProductId: "p1", userId: "same", createdAt: hoursAgo(1), username: "Mia", itemName: "Via offer" });
    const other = row({ offerId: null, productId: "p2", username: "Leo" });
    const cards = selectRecentBuyers([direct, viaOffer, other], { kind: "product", id: "p1" }, now);
    expect(cards).toHaveLength(1);
    expect(cards[0].itemName).toBe("Via offer");
  });

  it("names a person once per offer page, their newest purchase", () => {
    const rows = [
      row({ userId: "u", createdAt: hoursAgo(9), username: "Zoe" }),
      row({ userId: "u", createdAt: hoursAgo(2), username: "Zoe" }),
    ];
    const cards = selectRecentBuyers(rows, { kind: "offer", id: "offer-a" }, now);
    expect(cards).toHaveLength(1);
    expect(cards[0].at).toBe(hoursAgo(2));
  });

  it("shows one card per order on the home page, the main item before a bump or upsell", () => {
    const main = row({ orderId: "ord", userId: "u", itemKind: "product", itemName: "Main" });
    const bump = row({ orderId: "ord", userId: "u", itemKind: "bump", itemName: "Bump" });
    const oto = row({ orderId: "ord", userId: "u", itemKind: "oto", itemName: "Upsell" });
    const cards = selectRecentBuyers([bump, oto, main], { kind: "home" }, now);
    expect(cards.map((c) => c.itemName)).toEqual(["Main"]);
  });

  it("takes an offer checkout's own offer as the main item, though it is stored as oto", () => {
    // The offer checkout writes its offer as kind "oto"; a bump rides beside it,
    // and an upsell taken afterwards is a second "oto" row, written later.
    const offer = row({ orderId: "ord", userId: "u", itemKind: "oto", itemName: "Offer" });
    const bump = row({ orderId: "ord", userId: "u", itemKind: "bump", itemName: "Bump" });
    const upsell = row({ orderId: "ord", userId: "u", itemKind: "oto", itemName: "Upsell" });
    const cards = selectRecentBuyers([offer, bump, upsell], { kind: "home" }, now);
    expect(cards.map((c) => c.itemName)).toEqual(["Offer"]);
  });

  it("names a person once on the home page across two orders", () => {
    const rows = [row({ userId: "u", createdAt: hoursAgo(4) }), row({ userId: "u", createdAt: hoursAgo(1) })];
    expect(selectRecentBuyers(rows, { kind: "home" }, now)).toHaveLength(1);
  });

  it("gives the initial for the picture's fallback", () => {
    expect(selectRecentBuyers([row({ username: "élodie" })], { kind: "home" }, now)[0].initial).toBe("É");
  });

  it("carries nothing a card does not show", () => {
    const [card] = selectRecentBuyers([row()], { kind: "home" }, now);
    expect(Object.keys(card).sort()).toEqual(["at", "country", "firstName", "imageUrl", "initial", "itemName", "verb"]);
  });
});

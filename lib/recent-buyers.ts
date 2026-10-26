import { firstNameOf } from "@/lib/post-purchase-email";

// Which purchases become cards in the recent buyers popup (spec
// 2026-10-26-recent-buyers-popup-design.md).
//
// Pure: the rows arrive already filtered for what needs the database (paid,
// live, not a renewal, not an admin, not hidden, switch on). What is decided
// here is the window, the name, and who repeats.

export type BuyerScope = { kind: "offer"; id: string } | { kind: "product"; id: string } | { kind: "home" };

export type PurchaseRow = {
  orderId: string;
  userId: string;
  /** ISO. */
  createdAt: string;
  username: string | null;
  country: string | null;
  /**
   * As order_items.kind stores it. "oto" is also what the offer checkout writes
   * for the offer itself, so an order's first "oto" is its main item there.
   */
  itemKind: "product" | "bump" | "oto";
  offerId: string | null;
  productId: string | null;
  /** The product the item's offer grants, so a product page counts buyers who came through an offer. */
  grantProductId: string | null;
  itemName: string;
  imageUrl: string | null;
  verb: "enrolled in" | "joined";
  /** The granted product's own title and picture, for its page: the visitor is looking at the product, not the offer. */
  grantProductName: string | null;
  grantProductImage: string | null;
};

/** Everything a card shows, and nothing else: this goes to the public. */
export type BuyerCard = {
  firstName: string;
  initial: string;
  country: string | null;
  verb: "enrolled in" | "joined";
  itemName: string;
  imageUrl: string | null;
  at: string;
};

export const WINDOW_DAYS = 14;
export const MAX_CARDS = 20;

const NOT_NAMES = new Set(["test", "testing", "asdf", "admin", "user", "customer", "na", "n/a"]);
const LATIN = /^[\p{Script=Latin}'’-]+$/u;

/**
 * The first name a card may print, or null when there is none worth printing.
 *
 * Null is skipped, never replaced with "Someone": a card that cannot name a
 * real person is the made-up kind this popup exists not to be.
 */
export function displayFirstName(username: string | null): string | null {
  const first = firstNameOf(username);
  if (first.length < 2 || /\d/.test(first) || NOT_NAMES.has(first.toLowerCase())) return null;
  // Recased only when typed all one case. "McKenzie" chose its capitals.
  if (LATIN.test(first) && (first === first.toLowerCase() || first === first.toUpperCase())) {
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  }
  return first;
}

// Lower wins. A tie keeps the row seen first; the loader lists an order's
// items oldest first, so an offer beats the upsell added to its order later.
const KIND_RANK = { product: 0, oto: 1, bump: 2 } as const;

export function selectRecentBuyers(
  rows: PurchaseRow[],
  scope: BuyerScope,
  now: Date,
  viewerId?: string | null,
): BuyerCard[] {
  const since = now.getTime() - WINDOW_DAYS * 24 * 3_600_000;
  let pool = rows.filter(
    (r) =>
      new Date(r.createdAt).getTime() >= since &&
      r.userId !== viewerId &&
      (scope.kind === "home" ||
        (scope.kind === "offer" && r.offerId === scope.id) ||
        (scope.kind === "product" && (r.productId === scope.id || r.grantProductId === scope.id))),
  );

  // The home page tells one story per checkout: the thing they came for, not
  // the bump and the upsell beside it.
  if (scope.kind === "home") {
    const main = new Map<string, PurchaseRow>();
    for (const r of pool) {
      const seen = main.get(r.orderId);
      if (!seen || KIND_RANK[r.itemKind] < KIND_RANK[seen.itemKind]) main.set(r.orderId, r);
    }
    pool = [...main.values()];
  }

  pool.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const cards: BuyerCard[] = [];
  const people = new Set<string>();
  for (const r of pool) {
    if (cards.length === MAX_CARDS) break;
    if (people.has(r.userId)) continue;
    const firstName = displayFirstName(r.username);
    if (!firstName) continue;
    people.add(r.userId);
    // Came to this product page through an offer that grants it: name what the
    // visitor is looking at, not the offer they never saw.
    const viaOffer = scope.kind === "product" && r.productId !== scope.id;
    cards.push({
      firstName,
      initial: firstName.charAt(0).toUpperCase(),
      country: r.country,
      verb: r.verb,
      itemName: (viaOffer && r.grantProductName) || r.itemName,
      imageUrl: viaOffer ? (r.grantProductImage ?? r.imageUrl) : r.imageUrl,
      at: r.createdAt,
    });
  }
  return cards;
}

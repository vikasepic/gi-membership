import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

vi.mock("@/components/admin/refund-button", () => ({
  RefundButton: ({ amount }: { amount: string }) => <button>Refund {amount}</button>,
}));
const { OrderRowView } = await import("@/components/admin/order-row");
import type { OrderRow } from "@/lib/orders";

const order = (over: Partial<OrderRow> = {}): OrderRow => ({
  id: "o1",
  email: "buyer@test.com",
  status: "paid",
  currency: "usd",
  totalCents: 499,
  taxCents: null,
  buyerCountry: "IN",
  stripePaymentIntentId: "pi_abc123",
  createdAt: "2026-08-01T09:14:00Z",
  items: [
    { kind: "product", description: "The Guide", amountCents: 499, stripeSubscriptionId: null },
    { kind: "bump", description: "Funnel App", amountCents: 0, stripeSubscriptionId: "sub_1" },
  ],
  ...over,
});

const row = (o = order()) =>
  renderToStaticMarkup(
    <table>
      <tbody>
        <OrderRowView order={o} />
      </tbody>
    </table>,
  );

// Nine orders used to fill three screens, because every one was an expanded
// card carrying its own line items whether you wanted them or not.

describe("a closed row", () => {
  it("fits on one line", () => {
    const out = row();
    expect(out).toContain("buyer@test.com");
    expect(out).toContain("$4.99");
    expect(out).toContain("paid");
  });

  it("names the first item and counts the rest", () => {
    // Two lines of items in a row is a row that is no longer one line.
    const out = row();
    expect(out).toContain("The Guide");
    expect(out).toContain("+1");
  });

  it("keeps the detail out until it is asked for", () => {
    const out = row();
    expect(out).not.toContain("pi_abc123");
    expect(out).not.toContain("Refund");
  });

  it("says it can be opened", () => {
    expect(row()).toContain('aria-expanded="false"');
  });
});

describe("the money", () => {
  it("lines up", () => {
    // Digits in a column that do not line up are digits you cannot compare.
    expect(row()).toContain("tabular-nums");
  });
});

describe("the page", () => {
  const src = readFileSync("app/admin/orders/page.tsx", "utf8");

  it("computes its figures from what is on screen", () => {
    // Three numbers that never move whatever you filter to are decoration.
    expect(src).toContain("totalsFor(shown");
  });

  it("keeps the filter in the URL", () => {
    // A view becomes a link: sendable, bookmarkable, and the back button means
    // what it looks like it means.
    expect(src).toContain("filterFrom(await searchParams)");
    expect(src).toContain("filterHref(filter");
  });

  it("offers a subscriptions filter", () => {
    // The question the orders list could not answer at all.
    expect(src).toContain('key: "subscriptions"');
  });

  it("tells you why the screen is empty", () => {
    // "No orders yet" under a filter that hides them all is a lie.
    expect(src).toContain("Nothing matches that");
    expect(src).toContain("No orders yet");
  });

  it("offers a way out of a filter", () => {
    // JSX puts it on its own line; matching the word is what matters.
    expect(src).toMatch(/>\s*Clear\s*</);
  });
});

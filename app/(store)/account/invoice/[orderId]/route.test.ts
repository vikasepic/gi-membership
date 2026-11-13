import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The account page's Invoice link: make or find Stripe's invoice for the
 * member's own order, then go to it. Spec:
 * docs/superpowers/specs/2026-11-13-stripe-invoice-per-purchase-design.md.
 */

const state = vi.hoisted(() => ({
  user: { id: "u1", viewingAs: false } as { id: string; viewingAs: boolean } | null,
  result: { ok: true, invoiceId: "in_1", hostedUrl: "https://invoice.stripe.com/i/in_1", pdfUrl: null } as Record<string, unknown>,
}));
const invoiceForOrder = vi.hoisted(() => vi.fn(async (_a: { orderId: string; userId: string; create: boolean }) => state.result));

vi.mock("@/lib/view-as", () => ({ viewer: async () => state.user }));
vi.mock("@/lib/order-invoice", () => ({ invoiceForOrder }));

const { GET } = await import("@/app/(store)/account/invoice/[orderId]/route");

const get = (orderId: string) =>
  GET(new Request(`https://grow.test/account/invoice/${orderId}`), { params: Promise.resolve({ orderId }) });

beforeEach(() => {
  state.user = { id: "u1", viewingAs: false };
  state.result = { ok: true, invoiceId: "in_1", hostedUrl: "https://invoice.stripe.com/i/in_1", pdfUrl: null };
  invoiceForOrder.mockClear();
});

describe("the Invoice link", () => {
  it("makes or finds the member's own invoice, then goes to Stripe's page", async () => {
    const res = await get("o1");
    expect(invoiceForOrder).toHaveBeenCalledWith({ orderId: "o1", userId: "u1", create: true });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://invoice.stripe.com/i/in_1");
  });

  it("asks a signed-out visitor to sign in, by a relative Location, and asks Stripe nothing", async () => {
    state.user = null;
    const res = await get("o1");
    expect(res.headers.get("location")).toBe("/login?next=/account");
    expect(invoiceForOrder).not.toHaveBeenCalled();
  });

  it("only looks, never makes, for an admin viewing as the member", async () => {
    state.user = { id: "u1", viewingAs: true };
    state.result = { ok: false, reason: "view_only" };
    const res = await get("o1");
    expect(invoiceForOrder).toHaveBeenCalledWith({ orderId: "o1", userId: "u1", create: false });
    expect(res.headers.get("location")).toBe("/account?invoice=view-as");
  });

  it("opens an invoice that already exists for an admin viewing as the member", async () => {
    state.user = { id: "u1", viewingAs: true };
    expect((await get("o1")).headers.get("location")).toBe("https://invoice.stripe.com/i/in_1");
  });

  it.each(["not_found", "not_eligible", "stripe_error"])("goes back to the account page when the answer is %s", async (reason) => {
    state.result = { ok: false, reason };
    expect((await get("o1")).headers.get("location")).toBe("/account?invoice=unavailable");
  });

  it("falls back to the PDF when Stripe gives no hosted page", async () => {
    state.result = { ok: true, invoiceId: "in_1", hostedUrl: null, pdfUrl: "https://pay.stripe.com/invoice/in_1/pdf" };
    expect((await get("o1")).headers.get("location")).toBe("https://pay.stripe.com/invoice/in_1/pdf");
  });
});

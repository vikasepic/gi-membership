import { describe, it, expect, vi, afterEach } from "vitest";
import { sendCrmEvent } from "@/lib/crm";

// The CRM feed is fire-and-forget, which is exactly why it needs a test: a
// broken hook is silent by design, and the first symptom in production is
// customers quietly not being tagged.

const HOOK = "https://hooks.zapier.test/catch/123";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stubFetch(impl: () => Promise<Response>) {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("sendCrmEvent", () => {
  it("posts the event as JSON to the configured hook", async () => {
    vi.stubEnv("CRM_WEBHOOK_URL", HOOK);
    const spy = stubFetch(async () => new Response("ok", { status: 200 }));

    await sendCrmEvent({
      type: "purchase",
      email: "buyer@example.com",
      occurredAt: 1700000000,
      orderId: "order-1",
      productId: "prod-uuid-1",
      productSlug: "field-guide",
      totalCents: 2700,
      currency: "usd",
      items: [
        {
          kind: "product",
          description: "The Field Guide",
          amountCents: 2700,
          productId: "prod-uuid-1",
          productSlug: "field-guide",
        },
      ],
    });

    expect(spy).toHaveBeenCalledOnce();
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(HOOK);
    expect(init.method).toBe("POST");

    // Assert the actual wire payload — this is the contract Zapier filters on.
    const body = JSON.parse(init.body as string);
    expect(body.type).toBe("purchase");
    expect(body.productSlug).toBe("field-guide");
    expect(body.productId).toBe("prod-uuid-1"); // the stable key automation tags on
    expect(body.email).toBe("buyer@example.com");
    expect(body.items[0].kind).toBe("product");
    expect(body.items[0].productId).toBe("prod-uuid-1");
  });

  it("does nothing when no hook is configured", async () => {
    vi.stubEnv("CRM_WEBHOOK_URL", "");
    const spy = stubFetch(async () => new Response("ok"));
    await sendCrmEvent({ type: "purchase", email: "a@b.com", occurredAt: 1 });
    expect(spy).not.toHaveBeenCalled();
  });

  // The whole point of the guard: these calls sit inside finalizeOrder, after
  // the money has moved. A CRM outage must never turn a paid order into a
  // thrown error.
  it("swallows a network failure", async () => {
    vi.stubEnv("CRM_WEBHOOK_URL", HOOK);
    stubFetch(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(
      sendCrmEvent({ type: "purchase", email: "a@b.com", occurredAt: 1 }),
    ).resolves.toBeUndefined();
  });

  it("swallows a non-2xx response", async () => {
    vi.stubEnv("CRM_WEBHOOK_URL", HOOK);
    stubFetch(async () => new Response("nope", { status: 500 }));
    await expect(
      sendCrmEvent({ type: "purchase", email: "a@b.com", occurredAt: 1 }),
    ).resolves.toBeUndefined();
  });
});

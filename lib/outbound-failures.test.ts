import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * A failure only in the console is a failure nobody sees.
 *
 * The CRM's Zapier hook answered 404 on 1 Oct 2026 and the only trace was a
 * console line, in a container whose logs reset on every deploy. The CRM had
 * a retry runner all along, but sendCrmEvent never reported a failure, so
 * nothing was ever queued and a replay always "succeeded". Email failures
 * were the same. Both now land in error_events, which /admin/errors shows.
 */

const recorded = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("@/lib/errors", async (orig) => ({
  ...(await orig<typeof import("@/lib/errors")>()),
  recordError: async (a: Record<string, unknown>) => {
    recorded.push(a);
  },
}));

const { sendCrmEvent } = await import("@/lib/crm");
const { sendEmail } = await import("@/lib/email");
const { RUNNERS } = await import("@/lib/retry");

const event = { type: "refunded" as const, email: "m@example.com", occurredAt: 1790000000, orderId: "o1", productId: null, productSlug: null, totalCents: 39800, currency: "usd", items: [] };

beforeEach(() => {
  recorded.length = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the CRM", () => {
  it("queues a rejected event for a retry, with the whole event to replay", async () => {
    vi.stubEnv("CRM_WEBHOOK_URL", "https://hooks.zapier.test/catch/1");
    vi.stubGlobal("fetch", async () => new Response("gone", { status: 404 }));
    expect(await sendCrmEvent(event as never)).toBe(false);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ source: "crm", jobKind: "crm_event", jobPayload: event });
    expect(String(recorded[0].message)).toContain("404");
  });

  it("queues one it could not reach at all", async () => {
    vi.stubEnv("CRM_WEBHOOK_URL", "https://hooks.zapier.test/catch/1");
    vi.stubGlobal("fetch", async () => {
      throw new Error("ECONNRESET");
    });
    expect(await sendCrmEvent(event as never)).toBe(false);
    expect(recorded[0]).toMatchObject({ jobKind: "crm_event" });
  });

  it("records nothing when it works, or when no CRM is configured", async () => {
    vi.stubEnv("CRM_WEBHOOK_URL", "https://hooks.zapier.test/catch/1");
    vi.stubGlobal("fetch", async () => new Response("ok", { status: 200 }));
    expect(await sendCrmEvent(event as never)).toBe(true);
    vi.stubEnv("CRM_WEBHOOK_URL", "");
    await sendCrmEvent(event as never);
    expect(recorded).toEqual([]);
  });

  it("its retry throws while the hook still fails, and does not queue a second job", async () => {
    vi.stubEnv("CRM_WEBHOOK_URL", "https://hooks.zapier.test/catch/1");
    vi.stubGlobal("fetch", async () => new Response("gone", { status: 404 }));
    await expect(RUNNERS.crm_event(event as never)).rejects.toThrow();
    expect(recorded).toEqual([]);
  });
});

describe("email", () => {
  it("records a refused send on /admin/errors, naming the subject and the recipient", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM", "Store <s@example.com>");
    vi.stubGlobal("fetch", async () => new Response("domain not verified", { status: 403 }));
    expect(await sendEmail("m@example.com", { subject: "thank you, your plan has renewed", html: "<p/>", text: "" })).toBe("failed");
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ source: "email" });
    expect(String(recorded[0].message)).toContain("thank you, your plan has renewed");
    expect(String(recorded[0].message)).toContain("403");
    expect(recorded[0].context).toMatchObject({ to: "m@example.com" });
  });

  it("records nothing for a send that worked", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM", "Store <s@example.com>");
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 200 }));
    await sendEmail("m@example.com", { subject: "s", html: "", text: "" });
    expect(recorded).toEqual([]);
  });
});

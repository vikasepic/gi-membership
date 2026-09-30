import { it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/retry", () => ({ runDueJobs: vi.fn(async () => ({})) }));
vi.mock("@/lib/leads", () => ({ flushDueLeads: vi.fn(async () => ({})) }));
vi.mock("@/lib/subscription-reconcile", () => ({ repairSubscriptionDrift: vi.fn(async () => ({ repaired: [], skipped: [] })) }));
vi.mock("@/lib/post-purchase-send", () => ({ sweepPostPurchaseEmails: vi.fn(async () => ({ sent: 0, skipped: 0 })) }));
const due = vi.hoisted(() => vi.fn(async () => ({ sent: 2, skipped: 1, failed: 0 })));
vi.mock("@/lib/post-purchase-sequences", () => ({ sendDueSequenceEmails: due }));

const { POST } = await import("@/app/api/cron/retry/route");
afterEach(() => vi.unstubAllEnvs());

it("the 5-minute retry cron sends due sequence emails and reports what happened", async () => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  const res = await POST(new Request("http://localhost/api/cron/retry", { method: "POST", headers: { authorization: "Bearer test-secret" } }));
  expect(due).toHaveBeenCalledTimes(1);
  expect(await res.json()).toMatchObject({ ok: true, sequenceSent: 2, sequenceSkipped: 1, sequenceFailed: 0 });
});

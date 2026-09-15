import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn(async () => ({ id: "sub_sched_1", phases: [{ start_date: 1000 }] }));
const update = vi.fn(async () => ({ id: "sub_sched_1" }));
const scheduleCancel = vi.fn(async () => ({}));
const release = vi.fn(async () => ({}));
const subCancel = vi.fn(async () => ({}));
const retrieve = vi.fn(async (id: string) => ({ id, schedule: id === "sub_planned" ? "sub_sched_1" : null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/stripe", () => ({
  stripe: () => ({
    subscriptionSchedules: { create, update, cancel: scheduleCancel, release },
    subscriptions: { cancel: subCancel, retrieve },
  }),
}));

const { scheduleInstalments, endSubscription, releaseSchedule } = await import("@/lib/payment-plans-stripe");

const sub = (trialEnd: number | null, interval_count = 1) => ({
  id: "sub_1",
  trial_end: trialEnd,
  items: { data: [{ price: { id: "price_1", recurring: { interval: "month", interval_count } } }] },
});

describe("scheduling instalments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("wraps the subscription and ends it after N periods of the price", async () => {
    await scheduleInstalments(sub(null), 3);
    expect(create).toHaveBeenCalledWith({ from_subscription: "sub_1" }, { idempotencyKey: "plan_sub_1" });
    const [, body] = update.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(body.end_behavior).toBe("cancel");
    expect(body.phases).toEqual([
      { items: [{ price: "price_1", quantity: 1 }], start_date: 1000, duration: { interval: "month", interval_count: 3 } },
    ]);
  });

  it("multiplies a price that already spans several intervals", async () => {
    // Every 2 months, 3 payments: a six-month phase.
    await scheduleInstalments(sub(null, 2), 3);
    const [, body] = update.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect((body.phases as { duration: { interval_count: number } }[])[0].duration.interval_count).toBe(6);
  });

  it("gives a trial its own phase, so the billing phase still counts N", async () => {
    await scheduleInstalments(sub(2000), 3);
    const [, body] = update.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(body.phases).toEqual([
      { items: [{ price: "price_1", quantity: 1 }], trial: true, start_date: 1000, end_date: 2000 },
      { items: [{ price: "price_1", quantity: 1 }], duration: { interval: "month", interval_count: 3 } },
    ]);
  });
});

describe("ending a subscription", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cancels the schedule when there is one, which cancels the subscription", async () => {
    await endSubscription("sub_planned");
    expect(scheduleCancel).toHaveBeenCalledWith("sub_sched_1");
    expect(subCancel).not.toHaveBeenCalled();
  });
  it("cancels the subscription directly otherwise", async () => {
    await endSubscription("sub_plain");
    expect(subCancel).toHaveBeenCalledWith("sub_plain");
    expect(scheduleCancel).not.toHaveBeenCalled();
  });
  it("releases the schedule before a period-end cancel, and does nothing without one", async () => {
    await releaseSchedule("sub_planned");
    expect(release).toHaveBeenCalledWith("sub_sched_1");
    await releaseSchedule("sub_plain");
    expect(release).toHaveBeenCalledTimes(1);
  });
});

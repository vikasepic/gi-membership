import { describe, it, expect } from "vitest";
import { pricesField } from "@/lib/prices-field";

const base = {
  id: "p",
  label: "",
  billingType: "recurring",
  interval: "month",
  intervalCount: 1,
  trialDays: null,
  priceCents: 19900,
  compareAtCents: null,
  archived: false,
};
const parse = (over: Record<string, unknown>) => pricesField.safeParse(JSON.stringify([{ ...base, ...over }]));

describe("a plan through the save", () => {
  it("keeps the count", () => {
    const r = parse({ installments: 3 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data[0].installments).toBe(3);
  });
  it("defaults to none", () => {
    const r = parse({});
    expect(r.success && r.data[0].installments).toBeNull();
  });
  it("refuses fewer than 2 or more than 24", () => {
    expect(parse({ installments: 1 }).success).toBe(false);
    expect(parse({ installments: 25 }).success).toBe(false);
  });
  it("refuses a plan on a one-off", () => {
    expect(parse({ billingType: "one_time", interval: null, installments: 3 }).success).toBe(false);
  });
  it("lets a plan carry a trial", () => {
    expect(parse({ installments: 3, trialDays: 7 }).success).toBe(true);
  });
});

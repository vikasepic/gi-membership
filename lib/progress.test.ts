import { describe, it, expect } from "vitest";
import { shouldApply } from "@/lib/progress";

describe("shouldApply", () => {
  it("applies an auto signal when there is no existing row", () => {
    expect(shouldApply(null, "video", true)).toBe(true);
  });

  it("applies a manual completion when there is no existing row", () => {
    expect(shouldApply(null, "manual", true)).toBe(true);
  });

  it("ignores an auto signal for an already-complete item", () => {
    expect(shouldApply({ completed: true, manualOverride: false }, "dwell", true)).toBe(false);
  });

  it("ignores every auto signal once the student took manual control", () => {
    expect(shouldApply({ completed: false, manualOverride: true }, "video", true)).toBe(false);
    expect(shouldApply({ completed: false, manualOverride: true }, "dwell", true)).toBe(false);
    expect(shouldApply({ completed: false, manualOverride: true }, "download", true)).toBe(false);
  });

  it("always honours a manual toggle, including un-completing", () => {
    expect(shouldApply({ completed: true, manualOverride: false }, "manual", false)).toBe(true);
    expect(shouldApply({ completed: false, manualOverride: true }, "manual", true)).toBe(true);
  });
});

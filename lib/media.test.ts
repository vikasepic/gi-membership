import { describe, it, expect } from "vitest";
import { validateUpload } from "@/lib/media";

describe("validateUpload", () => {
  it("accepts a jpeg cover", () => {
    expect(validateUpload({ type: "image/jpeg", size: 500_000 }, "cover")).toEqual({ ok: true });
  });

  it("rejects a non-image cover", () => {
    const r = validateUpload({ type: "application/pdf", size: 1000 }, "cover");
    expect(r.ok).toBe(false);
  });

  it("rejects a cover over 5MB", () => {
    const r = validateUpload({ type: "image/png", size: 6_000_000 }, "cover");
    expect(r.ok).toBe(false);
  });

  it("accepts a pdf attachment", () => {
    expect(validateUpload({ type: "application/pdf", size: 1_000_000 }, "attachment")).toEqual({ ok: true });
  });

  it("rejects an executable attachment", () => {
    const r = validateUpload({ type: "application/x-msdownload", size: 1000 }, "attachment");
    expect(r.ok).toBe(false);
  });

  it("rejects an attachment over 100MB", () => {
    const r = validateUpload({ type: "application/pdf", size: 200_000_000 }, "attachment");
    expect(r.ok).toBe(false);
  });

  it("rejects an empty file", () => {
    expect(validateUpload({ type: "image/png", size: 0 }, "cover").ok).toBe(false);
  });
});

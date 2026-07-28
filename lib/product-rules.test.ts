import { describe, it, expect } from "vitest";
import { blocksPublish } from "@/lib/product-rules";

describe("publishing a product with no course", () => {
  it("is blocked, because the buyer would receive nothing", () => {
    expect(blocksPublish("published", [])).toBe(true);
  });

  it("is allowed once a course is attached", () => {
    expect(blocksPublish("published", ["course-1"])).toBe(false);
  });

  it("never blocks a draft — courseless is a normal work-in-progress state", () => {
    expect(blocksPublish("draft", [])).toBe(false);
  });
});

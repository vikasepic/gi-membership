import { describe, it, expect } from "vitest";
import { nextSortOrder, swapOrder } from "@/lib/curriculum-admin";

describe("nextSortOrder", () => {
  it("starts at zero for the first item", () => {
    expect(nextSortOrder([])).toBe(0);
  });
  it("appends after the highest existing position", () => {
    expect(nextSortOrder([{ sortOrder: 0 }, { sortOrder: 3 }])).toBe(4);
  });
});

describe("swapOrder", () => {
  const rows = [
    { id: "a", sortOrder: 0 },
    { id: "b", sortOrder: 1 },
    { id: "c", sortOrder: 2 },
  ];

  it("swaps an item with the one above it", () => {
    expect(swapOrder(rows, "b", "up")).toEqual([
      { id: "b", sortOrder: 0 },
      { id: "a", sortOrder: 1 },
    ]);
  });

  it("swaps an item with the one below it", () => {
    expect(swapOrder(rows, "b", "down")).toEqual([
      { id: "b", sortOrder: 2 },
      { id: "c", sortOrder: 1 },
    ]);
  });

  it("returns nothing when already first", () => {
    expect(swapOrder(rows, "a", "up")).toEqual([]);
  });

  it("returns nothing when already last", () => {
    expect(swapOrder(rows, "c", "down")).toEqual([]);
  });

  it("returns nothing for an unknown id", () => {
    expect(swapOrder(rows, "zzz", "up")).toEqual([]);
  });
});

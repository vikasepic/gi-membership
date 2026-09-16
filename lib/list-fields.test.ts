import { describe, it, expect } from "vitest";
import { BLOCK_CONTROLS, visibleItemFields } from "@/lib/block-controls";

/**
 * A card's per-item fields follow the block's Media setting.
 *
 * Seen 16 Sep 2026: Media set to None, and every card still offered an Icon
 * box, an Image picker and a URL field, none of which would draw anything.
 */
const list = BLOCK_CONTROLS.cards.content.find((c) => "kind" in c && c.kind === "list")!;
const keys = (props: Record<string, unknown>) =>
  visibleItemFields(list as Parameters<typeof visibleItemFields>[0], props).map((f) => f.key);

describe("a card's fields", () => {
  it("hide both media fields when Media is None", () => {
    expect(keys({ media: "none" })).toEqual(["title", "body", "amount"]);
  });
  it("show only the image when Media is Image", () => {
    expect(keys({ media: "image" })).toEqual(["title", "body", "amount", "image"]);
  });
  it("show only the icon when Media is Icon, which is the default", () => {
    expect(keys({ media: "icon" })).toEqual(["title", "body", "amount", "icon"]);
    expect(keys({})).toEqual(["title", "body", "amount", "icon"]);
  });
});

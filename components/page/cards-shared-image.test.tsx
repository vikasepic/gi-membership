import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Blocks } from "@/components/page/blocks";
import { bandTheme } from "@/lib/page-sections";
import { newBlock, type Block } from "@/lib/blocks";

const render = (b: Block) => renderToStaticMarkup(<Blocks blocks={[b]} theme={bandTheme("paper")} />);
const cards = (props: Record<string, unknown>): Block => {
  const b = newBlock("cards");
  return {
    ...b,
    props: {
      ...b.props,
      media: "image",
      items: [
        { title: "One", body: "a", icon: "", image: "" },
        { title: "Two", body: "b", icon: "", image: "https://x.test/own.png" },
      ],
      ...props,
    },
  };
};

describe("one image on every card", () => {
  it("draws the shared picture on each card, over a card's own", () => {
    const out = render(cards({ sharedImage: "https://x.test/shared.png" }));
    expect(out.match(/src="https:\/\/x\.test\/shared\.png"/g)).toHaveLength(2);
    expect(out).not.toContain("own.png");
  });
  it("leaves cards alone when none is set", () => {
    const out = render(cards({}));
    expect(out).toContain("own.png");
    expect(out).not.toContain("shared.png");
  });
});

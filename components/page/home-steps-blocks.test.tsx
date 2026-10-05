import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The home page as steps (owner, 5 Oct 2026): the step sections and the
 * staircase at the top draw the same list, and nothing the store sells may
 * drop off the page because it has no step.
 */
vi.mock("next/link", () => ({ default: (p: { href: string; children: unknown }) => <a href={p.href}>{p.children as never}</a> }));

const { StepsBlock, StaircaseBlock } = await import("@/components/page/home-steps-blocks");
import type { HomeStepsView, StepItem } from "@/lib/home-steps";

const item = (name: string, over: Partial<StepItem> = {}): StepItem => ({
  key: `offer:${name}`,
  kind: "App",
  name,
  line: `${name} line`,
  imageUrl: `https://cdn.test/${name}.webp`,
  price: "$29",
  bill: "Pay once",
  href: `/o/${name}`,
  owned: false,
  ...over,
});
const step = (number: number, short: string, items: StepItem[]) => ({
  id: short.toLowerCase(),
  short,
  title: `${short} title`,
  line: `${short} line`,
  number,
  anchor: `step-${number}`,
  items,
});
const store = (steps: HomeStepsView) => ({ products: [], memberships: [], steps });

describe("StepsBlock", () => {
  it("draws each step with its number, its words and its products", () => {
    const html = renderToStaticMarkup(
      <StepsBlock store={store({ steps: [step(1, "Idea", [item("validator")]), step(2, "Build", [item("funnel"), item("micro")])], other: [] })} title="Pick the step you're on" note="New apps join the step they help with" otherTitle="Everything else" />,
    );
    expect(html).toContain('id="step-1"');
    expect(html).toContain('id="step-2"');
    expect(html).toContain("Step 2");
    expect(html).toContain("Build title");
    expect(html).toContain('href="/o/micro"');
    expect(html).toContain('src="https://cdn.test/funnel.webp"');
    expect(html).toContain("Pick the step you&#x27;re on");
    expect(html).not.toContain("Everything else");
  });

  it("shows what has no step under Everything else, even with no steps at all", () => {
    const html = renderToStaticMarkup(
      <StepsBlock store={store({ steps: [], other: [item("book-writer")] })} title="" note="" otherTitle="Everything else" />,
    );
    expect(html).toContain("Everything else");
    expect(html).toContain('href="/o/book-writer"');
  });

  it("marks what the reader already owns instead of selling it again", () => {
    const html = renderToStaticMarkup(
      <StepsBlock store={store({ steps: [step(1, "Idea", [item("validator", { owned: true, price: "In your library", bill: "Yours", href: "/library" })])], other: [] })} title="" note="" otherTitle="" />,
    );
    expect(html).toContain("In your library");
    expect(html).toContain('href="/library"');
  });

  it("draws nothing without the store's data, like every storefront block", () => {
    expect(renderToStaticMarkup(<StepsBlock store={{ products: [], memberships: [] }} title="x" note="" otherTitle="" />)).toBe("");
  });
});

describe("StaircaseBlock", () => {
  it("draws one step per column, linked to its section, with each product's name on its picture", () => {
    const html = renderToStaticMarkup(
      <StaircaseBlock store={store({ steps: [step(1, "Idea", [item("validator")]), step(2, "Build", [item("funnel")])], other: [] })} max={3} />,
    );
    expect(html).toContain('href="#step-1"');
    expect(html).toContain('href="#step-2"');
    expect(html).toContain(">Idea<");
    expect(html).toContain(">validator<");
    expect(html).toContain("repeat(2, minmax(0, 1fr))");
  });

  it("caps the pictures per step and links the rest to the step", () => {
    const many = ["a", "b", "c", "d", "e"].map((n) => item(n));
    const html = renderToStaticMarkup(<StaircaseBlock store={store({ steps: [step(1, "Get seen", many)], other: [] })} max={3} />);
    expect(html).toContain(">c<");
    expect(html).not.toContain(">d<");
    expect(html).toContain("+2 more");
  });

  it("draws nothing when no step has anything in it", () => {
    expect(renderToStaticMarkup(<StaircaseBlock store={store({ steps: [], other: [item("x")] })} max={3} />)).toBe("");
  });
});

import { describe, it, expect } from "vitest";
import { buildHomeSteps } from "@/lib/home-steps";
import { DEFAULT_HOME_STEPS, homeStepsSchema } from "@/lib/home-steps-schema";

const offer = (over: Record<string, unknown> = {}) => ({
  offer: {
    id: "fa", name: "Funnel App", headline: "Build the entire low-ticket funnel in one sitting.", description: "A product outline.",
    imageUrl: "https://cdn.test/funnel.webp", grantType: "subscription" as const, grantProductId: null,
    billingType: "recurring" as const, interval: "month", intervalCount: 1, trialDays: 7, priceCents: 2900, currency: "usd",
    homeStep: "build", ...over,
  },
  href: "/o/funnel-builder",
  owned: false,
});
const product = (over: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  product: {
    id: "dpv", slug: "digital-product-validator", title: "Digital Product Validator", tagline: "Find if your idea is a hit.",
    priceCents: 2900, currency: "usd", homeStep: "idea", ...over,
  },
  coverUrl: "https://cdn.test/dpv.png",
  type: "text",
  owned: false,
  ...extra,
});

describe("buildHomeSteps", () => {
  it("puts each offer and product under its step, numbered in the order the steps are set", () => {
    const view = buildHomeSteps({ steps: DEFAULT_HOME_STEPS, offers: [offer()], products: [product()] });
    expect(view.steps.map((s) => [s.number, s.anchor, s.short, s.items.map((i) => i.name)])).toEqual([
      [1, "step-1", "Idea", ["Digital Product Validator"]],
      [2, "step-2", "Build", ["Funnel App"]],
    ]);
    expect(view.other).toEqual([]);
  });

  it("hides a step with nothing in it and numbers the rest without a gap", () => {
    const view = buildHomeSteps({ steps: DEFAULT_HOME_STEPS, offers: [offer({ homeStep: "seen" })], products: [] });
    expect(view.steps.map((s) => [s.number, s.id])).toEqual([[1, "seen"]]);
  });

  it("sends anything with no step, or a step that no longer exists, to Everything else", () => {
    const view = buildHomeSteps({
      steps: DEFAULT_HOME_STEPS,
      offers: [offer({ homeStep: null }), offer({ id: "bw", name: "Book Writer", homeStep: "deleted-step" })],
      products: [product({ homeStep: null })],
    });
    expect(view.steps).toEqual([]);
    expect(view.other.map((i) => i.name)).toEqual(["Funnel App", "Book Writer", "Digital Product Validator"]);
  });

  it("lists offers before products inside a step, each in the store's own order", () => {
    const view = buildHomeSteps({
      steps: DEFAULT_HOME_STEPS,
      offers: [offer({ id: "ce", name: "Content Engine", homeStep: "seen" }), offer({ id: "hg", name: "Viral Hook Generator", homeStep: "seen" })],
      products: [product({ id: "vc", slug: "viral-carousels", title: "The Guide to Viral Carousels", homeStep: "seen" }, { type: "pdf" })],
    });
    expect(view.steps[0].items.map((i) => [i.name, i.kind])).toEqual([
      ["Content Engine", "App"],
      ["Viral Hook Generator", "App"],
      ["The Guide to Viral Carousels", "Guide"],
    ]);
  });

  it("says what each costs and how it bills", () => {
    const view = buildHomeSteps({
      steps: DEFAULT_HOME_STEPS,
      offers: [offer(), offer({ id: "hg", name: "Hooks", billingType: "one_time", interval: null, trialDays: null, priceCents: 1900 }), offer({ id: "m", name: "Monthly", trialDays: 0 })],
      products: [],
    });
    expect(view.steps[0].items.map((i) => [i.price, i.bill])).toEqual([
      ["$29 a month", "7 days free"],
      ["$19", "Pay once"],
      ["$29 a month", "Monthly"],
    ]);
  });

  it("links to the sales page, or into the library for something the reader owns", () => {
    const view = buildHomeSteps({
      steps: DEFAULT_HOME_STEPS,
      offers: [offer(), { ...offer({ id: "ce", name: "Content Engine" }), owned: true }],
      products: [product({}, { owned: true, accessHref: "/library/dpv" }), product({ id: "x", slug: "x", title: "X" })],
    });
    const items = view.steps.flatMap((s) => s.items);
    expect(items.map((i) => [i.name, i.href, i.owned])).toEqual([
      ["Digital Product Validator", "/library/dpv", true],
      ["X", "/p/x", false],
      ["Funnel App", "/o/funnel-builder", false],
      ["Content Engine", "/library", true],
    ]);
    expect(items[0].price).toBe("In your library");
  });

  it("skips a page title used as a headline, and never lists a product an offer on the page already sells", () => {
    const view = buildHomeSteps({
      steps: DEFAULT_HOME_STEPS,
      offers: [offer({ grantType: "product", grantProductId: "dpv", headline: "Validator | Greater Inside", description: "Check the idea first.", homeStep: "idea" })],
      products: [product()],
    });
    expect(view.steps[0].items).toHaveLength(1);
    expect(view.steps[0].items[0].line).toBe("Check the idea first.");
    expect(view.steps[0].items[0].kind).toBe("Guide");
  });
});

describe("homeStepsSchema", () => {
  it("is the three default steps when nothing is saved", () => {
    expect(homeStepsSchema.parse(undefined).map((s) => s.id)).toEqual(["idea", "build", "seen"]);
  });

  it("keeps an empty list as a choice, and the first of a repeated id", () => {
    expect(homeStepsSchema.parse([])).toEqual([]);
    const two = homeStepsSchema.parse([
      { id: "a", short: "A" },
      { id: "a", short: "Again" },
    ]);
    expect(two.map((s) => s.short)).toEqual(["A"]);
  });

  it("refuses an id the database would refuse", () => {
    expect(homeStepsSchema.safeParse([{ id: "Has Spaces", short: "X" }]).success).toBe(false);
  });
});
